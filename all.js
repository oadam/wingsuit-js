$(document).ready(function() {
		'use strict';
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
				fm.add(settings, name);
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
		});

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
		render = function() {
			var newRenderTime = $.now();
			var info = [];
			info.push('speed : ' + (v.length()*3.6).toFixed(1) + ' km/h');
			info.push('fps : ' + (1000/ (newRenderTime-lastRenderTime)).toFixed(0));
			$info.html(info.join('<br/>'));
			lastRenderTime = newRenderTime;

			//clear
			ctx.save();
			// put (0, 0) at bottom right
			ctx.scale(1, -1);
			ctx.translate(0, -canvasH);
			ctx.fillStyle = 'lightblue';
			ctx.fillRect(0, 0, canvasW, canvasH);

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
			ctx.save();
			ctx.strokeStyle = 'black';
			ctx.lineWidth = 1e-2;
			ctx.rotate(-a - v.horizontalAngle());
			ctx.scale(settings.cameraDist, settings.cameraDist);
			ctx.translate(-1, 0);
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
