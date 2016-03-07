$(document).ready(function() {
		'use strict';

		var Color = net.brehaut.Color;

		var settings = {
			pause: false
		};
		var gui = new dat.GUI();
		gui.remember(settings);
		
		gui.add(settings, 'pause');
		function addAllToGui(folder, values) {
			var fm = gui.addFolder(folder);
			$.extend(settings, values);
			for (name in values) {
				var val = values[name];
				var isColor = (typeof val) == 'string' && val.match('#......');
				if (isColor) {
					fm.addColor(settings, name);
				} else {
					fm.add(settings, name);
				}
			}
		}
		//mountain shape
		addAllToGui('Mountain', {
			stepLength: 200,
			randomStrength: 0.9,
			slope: 1/3
		});

		//controls
		var yinit = 1;
		var ainit = 0*Math.PI / 2;
		var vinit = 100;
		var angularSpeedSign = 0;
		var angularSpeed = 5e-3;
		var maxAngularSpeed = 1;

		//physics
		var g = 9.8, rho = 1.2;

		//plane
		addAllToGui('Plane', {
			antiStall: 4.5e-4,//rad.s-1.(m/s)-2
			stallAngle: 16/180*Math.PI,
			trim: 8/180*Math.PI,
			cLiftMax: 1,
			cWingDrag: 1.1,
			cBodyDrag: 2,
			bodyS: 0.7,
			bodyDragS: 0.02,
			mass: 80,
			length: 2 
		});

		//graphics
		var planeImageSrc = 'plane.png';
		var screenPlaneLength = 60;//px
		var artificialPlaneZoom = 5;
		var planeOffsetTopLeft = new Victor(80, -80);
		var arrowWidthRatio = 0.15;
		var speedArrowZoom = 12e-2;
		var forceArrowZoom = 3e-3;
		
		var zoom = screenPlaneLength / settings.length / artificialPlaneZoom;

		addAllToGui('3d', {
			cameraDist: 10,
			cameraAperture: 20/180*Math.PI,
			pointSpacing: 0.5/180*Math.PI,// in rad
			fieldDepth: 300,// meters
			mountainWidth: 10,
			show3DPoints: true,// TODO
			rainbowMode: false,
			rainbowCycle: 100,
			view3DWidth: $(window).height()*0.8,
			sunDir: 45/180 * Math.PI,
			ambiant: '#311c09',
			skyAmbiant: '#593311',
			diffuse: '#311c09',
			specular: '#666666',
			shininess: 3.0
		});

		/**
		 * Reflects a vector v on a surface with normal vector norm
		 * */
		function reflect(v, norm) {
			return norm.clone().multiplyScalar(-2 * v.dot(norm)).add(v);
		}

		function color(eyeDir, point, norm) {
			if (settings.rainbowMode) {
				var hue = 360 * ((point.x/settings.rainbowCycle) % 1);
				return Color({hue: hue, saturation: 1, value: 1});
			}
			var sunDir = new Victor(1, 0).rotate(Math.PI/2 - settings.sunDir);
			var hiddenSky = Math.abs(norm.verticalAngle()/Math.PI);
			var a = Color(settings.ambiant);
			var sa = Color(settings.skyAmbiant).darkenByRatio(hiddenSky);
			var d = Color(settings.diffuse).darkenByRatio(1 - norm.dot(sunDir));
			var eyeReflexion = reflect(eyeDir, norm);
			var s = Color(settings.specular).darkenByRatio(1 - Math.pow(eyeReflexion.dot(sunDir), settings.shininess));
			return Color([
				255 * (a.getRed() + sa.getRed() + d.getRed() + s.getRed()),
				255 * (a.getGreen() + sa.getGreen() + d.getGreen() + s.getGreen()),
				255 * (a.getBlue() + sa.getBlue() + d.getBlue() + s.getBlue())
			]);
		}

		//physic engine
		var testStep = 1/100;
		var minStep = 1/25;//when offscreen setInterval is called every 200ms or more

		//see http://upload.wikimedia.org/wikipedia/commons/2/22/Lift_drag_graph.JPG
		var cDrag = function(alpha) {
			return Math.sin(alpha) * Math.sin(alpha) * settings.cWingDrag;
		};

		var cLift = function(alpha) {
			alpha = alpha % (2*Math.PI);//alpha between -2PI and 2PI
			alpha = ((alpha+ 3 * Math.PI) % (2*Math.PI)) - Math.PI;//alpha between -PI and PI
			var absAlpha = Math.abs(alpha);
			var absRes = null;
			if (absAlpha < settings.stallAngle) {
				absRes = absAlpha / settings.stallAngle * settings.cLiftMax;
			} else {
				absRes = Math.max(0, settings.cLiftMax * (1 - (absAlpha - settings.stallAngle)/settings.stallAngle));
			}
			return alpha > 0 ? absRes : -absRes;
		};

		var updateA = function(da) {
			a+=da;
			v.rotate(-da);
		};

		var update = function(step) {
			if (settings.pause) {return;}
			var f = new Victor();

			//gravity
			var gravity = new Victor(0, -settings.mass * g);
			gravity.rotate(-a);
			f.add(gravity);

			var attackAngle = v.horizontalAngle();

			//update a and avoid stall
			var da = angularSpeedSign * Math.min(maxAngularSpeed, angularSpeed * v.lengthSq()) * step;
			var sinAntiStall = Math.sin(attackAngle + settings.trim);
			var antiStallUpdate = settings.antiStall * v.lengthSq() * Math.abs(sinAntiStall) * sinAntiStall * step;
			da += antiStallUpdate;
			updateA(da);
			
			//bodyDrag
			f.add(v.clone().multiplyScalar(-0.5 * rho * settings.bodyDragS * v.length() * settings.cBodyDrag));

			var wingforce = new Victor(cDrag(attackAngle), cLift(attackAngle));
			wingforce.multiplyScalar(-0.5 * rho * settings.bodyS * v.lengthSq());
			wingforce.rotate(attackAngle);
			f.add(wingforce);

			lastf = f.clone().subtract(gravity);

			//actual updates
			f.multiplyScalar(step / settings.mass);
			v.add(f);

			pos.add(v.clone().multiplyScalar(step).rotate(a));
			
			//die if dead
			if (pos.y < height(pos.x, 1 / zoom)) {
				reset();
			}
		};

		//physics loop
		var lastUpdated = $.now();
		var interval = setInterval(function() {
				var now = $.now();
				var dt = (now-lastUpdated)/1000;
				lastUpdated = now;

				var remainingDt = dt, allUpdated = false;
				while (!allUpdated) {
				var step;
				if (remainingDt <= minStep) {
				step = remainingDt;
				allUpdated = true;
				} else {
				step = minStep;
				remainingDt -= minStep;
				}
				update(step);
				}

				}, 1000*testStep);


		var canvas = $('canvas');
		canvas = canvas[0];
		canvas.width = Math.floor($(window).width()* 0.9);
		canvas.height = Math.floor($(window).height()*0.8);
		var canvasW = canvas.width;
		var canvasH = canvas.height;
		var ctx = canvas.getContext('2d');
		var $info = $('<p/>').appendTo(document.body);

		var pos, v, a;
		var lastf = new Victor();
		var reset = function() {
			pos = new Victor(0, yinit);
			v = new Victor(vinit, 0);
			a = ainit;
		};
		reset();
		

		var pseudoRandom = function(x) {
			return Math.abs((((1.2345 * x % 0.33) + (6.322 * x % 0.33) + (3.87 * x % 0.33)) % 1)) - 0.5;
		};

		function compute3DPointsInDirection(cameraDir, cameraPos, direction) {
			var delta = 1 / zoom;
			var pointsRight = [];
			var current = new Victor(pos.x, height(pos.x, delta));
			var topCameraDir = cameraDir.clone().rotate(direction * settings.cameraAperture);
			var bottomCameraDir = cameraDir.clone().rotate(-direction * settings.cameraAperture);
			while(true) {
				if (pointsRight.length > 1000) {
					console.warn('too many points computed');
					break;
				}
				if (Math.abs(current.x - pos.x) > settings.fieldDepth) {
					break;
				}
				var vectorToPoint = current.clone().subtract(cameraPos);
				// stop if above top of camera
				if (topCameraDir.cross(vectorToPoint) * direction > 0) {
					break;
				}
				// push only if in field of view
				if (bottomCameraDir.cross(vectorToPoint) * direction > 0) {
					pointsRight.push(current);
				}
				var nextX = current.x + direction * vectorToPoint.length() * settings.pointSpacing;
				current = new Victor(nextX, height(nextX, delta));
			}
			return pointsRight;
		}

		function height(x, delta) {
			var prevStep = Math.floor(x/settings.stepLength)*settings.stepLength;
			var left = prevStep, right = prevStep + settings.stepLength;
			var leftHeight = -left * settings.slope, rightHeight = -right * settings.slope;

			while (right - left > delta) {
				var middle = (left + right) / 2;
				var middleHeight = (leftHeight + rightHeight) / 2;
				middleHeight += (right - left) * pseudoRandom(middle) * settings.randomStrength;
				if (x < middle) {
					right = middle;
					rightHeight = middleHeight;
				} else {
					left = middle;
					leftHeight = middleHeight;
				}
			}
			return (leftHeight + rightHeight) / 2;
		}

		var render = null, animationRequestId = null;
		var browserRequestAnim = window.requestAnimationFrame || window.mozRequestAnimationFrame ||  window.webkitRequestAnimationFrame || window.msRequestAnimationFrame;

		var planeImage = new Image();
		planeImage.src = planeImageSrc;

		var requestAnim = function() {
			animationRequestId = browserRequestAnim(render, canvas);
		};
		var lastRenderTime = $.now();
		function draw3DPoint(ctx, cameraPos, cameraDir, points, direction) {
			for (var i = 0; i < points.length - 1; i++) {
				var p = points[i];
				var p2 = points[i+1];
				var norm = p2.clone().subtract(p).normalize().rotate(direction * Math.PI/2);
				var eyeDir = p.clone().subtract(cameraPos).normalize();
				var eyeDir2 = p2.clone().subtract(cameraPos).normalize();
				var c = color(eyeDir, p, norm);
				ctx.fillStyle = c.toCSS();
				ctx.fillRect(p.x-2/zoom, p.y-2/zoom, 4/zoom, 4/zoom);

				// 3D view
				ctx.save();
				ctx.resetTransform();
				// put (0, 0) at bottom right
				ctx.scale(1, -1);
				ctx.translate(0, -canvasH);
				var angle1 = eyeDir.angle() - cameraDir.angle();
				var angle2 = eyeDir2.angle() - cameraDir.angle();
				var Y1 = (1 + angle1 / settings.cameraAperture) * canvasH / 2;
				var Y2 = (1 + angle2 / settings.cameraAperture) * canvasH / 2;
				var angleW = settings.mountainWidth / p.clone().subtract(cameraPos).length();
				var halfWidth = settings.view3DWidth / 2;
				var wPx = Math.min(halfWidth, angleW / settings.cameraAperture * halfWidth);
				ctx.fillRect(halfWidth - wPx, Math.min(Y1, Y2), 2*wPx, Math.abs(Y2-Y1));
				ctx.restore();
			}
		}
		render = function() {

			// 3d points
			var cameraDir = v.clone().rotate(a).normalize();
			var cameraPos = pos.clone().subtract(cameraDir.clone().multiplyScalar(settings.cameraDist));
			var pointsRight = compute3DPointsInDirection(cameraDir, cameraPos, 1).reverse();
			var pointsLeft = compute3DPointsInDirection(cameraDir, cameraPos, -1).reverse();

			//clear
			ctx.save();
			// put (0, 0) at bottom right
			ctx.scale(1, -1);
			ctx.translate(0, -canvasH);
			ctx.fillStyle = 'lightblue';
			ctx.fillRect(0, 0, canvasW, canvasH);
			if (settings.show3DPoints) {
				ctx.translate(settings.view3DWidth, 0);
			}

			// translate and scale so that real coordinates can be used
			// we want pos + translation = 1/zoom * ((0, canvasH) + planeOffsetTopLeft)
			ctx.scale(zoom, zoom);
			var pixelTranslation = new Victor(0, canvasH).add(planeOffsetTopLeft);
			var translation = pixelTranslation.clone().multiplyScalar(1/zoom).subtract(pos);
			ctx.translate(translation.x, translation.y);

			//moutain
			ctx.fillStyle = 'brown';
			ctx.beginPath();
			ctx.moveTo(-translation.x, -translation.y);
			for(var j = 0; j < canvasW; j++) {
				var delta = 1 / zoom;
				var x = -translation.x + j / zoom;
				var y = height(x, delta);
				ctx.lineTo(x, y);
			}
			ctx.lineTo(-translation.x + canvasW/zoom, -translation.y);
			ctx.closePath();
			ctx.fill();

			// 3d cam
			if (settings.show3DPoints) {
				ctx.save();
				ctx.translate(cameraPos.x, cameraPos.y);
				ctx.rotate(cameraDir.angle());
				ctx.strokeStyle = 'black';
				ctx.lineWidth = 1/zoom/settings.cameraDist;
				ctx.scale(settings.cameraDist, settings.cameraDist);
				var tip = new Victor(0.4, 0);
				tip.rotate(settings.cameraAperture);
				ctx.beginPath();
				ctx.moveTo(tip.x, tip.y);
				ctx.lineTo(0, 0);
				ctx.lineTo(tip.x, -tip.y);
				var middle = tip.clone().multiplyScalar(0.5);
				ctx.moveTo(middle.x, middle.y);
				ctx.lineTo(middle.x, -middle.y);
				ctx.stroke();
				ctx.restore();
			}

			// 3d points in 2d
			if (settings.show3DPoints) {
				draw3DPoint(ctx, cameraPos, cameraDir, pointsRight, 1);
				draw3DPoint(ctx, cameraPos, cameraDir, pointsLeft, -1);
			}

			// plane
			ctx.save();
			ctx.translate(pos.x, pos.y);
			ctx.rotate(a);
			// speed and force
			ctx.save();
			ctx.lineWidth = 1e-2;
			drawArrow(ctx, v, speedArrowZoom, 'green', (v.length()*3.6).toFixed(1), 'darkgreen');
			drawArrow(ctx, lastf, forceArrowZoom, 'red');

			ctx.restore();


			// image
			ctx.save();
			ctx.scale(-settings.length * artificialPlaneZoom, -settings.length * artificialPlaneZoom);
			ctx.drawImage(planeImage, -0.5,-11.5/49,1,23/49);
			ctx.restore();

			ctx.restore();

			ctx.restore();


			// text info
			var newRenderTime = $.now();
			var info = [];
			info.push('speed : ' + (v.length()*3.6).toFixed(1) + ' km/h');
			info.push('fps : ' + (1000/ (newRenderTime-lastRenderTime)).toFixed(0));
			info.push('# of 3D points : ' + (pointsLeft.length + pointsRight.length));
			$info.html(info.join('<br/>'));
			lastRenderTime = newRenderTime;

			requestAnim();
		};
		requestAnim();

		function drawArrow(ctx, v, zoom, arrowColor, text, textColor) {
			ctx.save();
			ctx.strokeStyle = arrowColor;
			var a = v.horizontalAngle();
			var l = v.length();
			ctx.scale(l * zoom, l * zoom);
			ctx.rotate(a);
			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.lineTo(1, 0);
			ctx.moveTo(1-arrowWidthRatio, arrowWidthRatio);
			ctx.lineTo(1, 0);
			ctx.lineTo(1-arrowWidthRatio, -arrowWidthRatio);
			ctx.stroke();
			//text
			if (textColor) {
				ctx.translate(0.45, 0.03);
				ctx.scale(0.015, -0.015);
				ctx.fillStyle= textColor;
				ctx.fillText(text, 0, 0);
			}
			ctx.restore();
		}


		//keyboard
		window.onkeydown = function(event) {
			switch(event.which) {
				case 40:
					angularSpeedSign = 1;
					break;
				case 38:
					angularSpeedSign = -1;
					break;
				case 82:// 'r'
					reset();
					break;
				case 80:// 'p'
					settings.pause = !settings.pause;
					break;
			}
		};
		window.onkeyup = function(event) {
			switch(event.which) {
				case 40:
				case 38:
					angularSpeedSign = 0;
					break;
			}
		};
	$('#reset').click(reset);
});
