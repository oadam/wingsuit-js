$(document).ready(function() {
		'use strict';
		//mountain shape		
		var stepLength = 200;
		var randomStrength = 0.9;
		var slope = 1/3;

		//controls
		var yinit = 1;
		var vinit = 100;
		var angularSpeedSign = 0;
		var angularSpeed = 5e-3;
		var maxAngularSpeed = 1;

		//physics
		var g = 9.8, rho = 1.2;

		//plane
		var antiStall = 4.5e-4;//rad.s-1.(m/s)-2
		var stallAngle = 16/180*Math.PI;
		var cLiftMax = 1;
		var cWingDrag = 1.1;
		var cBodyDrag = 2;
		var bodyS = 0.7;
		var bodyDragS = 0.02;

		var M = 80, L = 2, gPos = 0.4;

		//graphics
		var planeImageSrc = 'plane.png';
		var screenPlaneLength = 20;//px
		var planePosX = 60;//px
		var planePosY = 60;//px
		
		var zoom = screenPlaneLength / L;

		//physic engine
		var testStep = 1/100;
		var minStep = 1/25;//when offscreen setInterval is called every 200ms or more

		//see http://upload.wikimedia.org/wikipedia/commons/2/22/Lift_drag_graph.JPG
		var cDrag = function(alpha) {
			return Math.sin(alpha) * Math.sin(alpha) * cWingDrag;
		};

		var cLift = function(alpha) {
			alpha = alpha % (2*Math.PI);//alpha between -2PI and 2PI
			alpha = ((alpha+ 3 * Math.PI) % (2*Math.PI)) - Math.PI;//alpha between -PI and PI
			var absAlpha = Math.abs(alpha);
			var absRes = null;
			if (absAlpha < stallAngle) {
				absRes = absAlpha / stallAngle * cLiftMax;
			} else {
				absRes = Math.max(0, cLiftMax * (1 - (absAlpha - stallAngle)/stallAngle));
			}
			return alpha > 0 ? absRes : -absRes;
		};

		var updateA = function(da) {
			a+=da;
			vL = vL * Math.cos(da) + vV * Math.sin(da);
			vV = - vL * Math.sin(da) + vV * Math.cos(da);
		};

		var computeAttackAngle = function(vL, vV) {
			return - ((vL === 0) ? Math.PI/2 : Math.atan(vV/vL)) + ((vL > 0) ? 0 : Math.PI);
		};

		var update = function(step) {
			'use strict';

			var cosA = Math.cos(a), sinA = Math.sin(a);

			var fL = 0, fV = 0;

			//gravity
			var gravityL = -M * g * sinA;
			var gravityV = -M * g * cosA;
			fL += gravityL;
			fV += gravityV;

			var attackAngle = computeAttackAngle(vL, vV);
			var v = Math.sqrt(vL*vL + vV*vV);

			//update a and avoid stall
			var da = angularSpeedSign * Math.min(maxAngularSpeed, angularSpeed * v * v) * step;
			var futureA = (attackAngle + da)  % (2*Math.PI);
			var sinAttackAngle = Math.sin(attackAngle);			
			var antiStallUpdate = - antiStall * v * v * Math.abs(sinAttackAngle) * sinAttackAngle * step;
			da += antiStallUpdate;
			updateA(da);
			
			//bodyDrag
			fL -= 0.5 * rho * bodyDragS * vL * vL * cBodyDrag;

			//wing
			var wingDragOverV = 0.5 * rho * bodyS * v * cDrag(attackAngle);
			var wingLiftOverV = 0.5 * rho * bodyS * v * cLift(attackAngle);

			var wfL = - vL * wingDragOverV - vV * wingLiftOverV;
			var wfV = - vV * wingDragOverV + vL * wingLiftOverV;

			fL += wfL;
			fV += wfV;

			lastfL = fL - gravityL;
			lastfV = fV - gravityV;

			//actual updates
			vL += fL * step / M;
			vV += fV * step / M;

			x += vL * cosA * step - vV * sinA * step;
			y += vL * sinA * step + vV * cosA * step;
			
			//die if dead
			if (y < height(x, 1 / zoom)) {
				//alert('dead');
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

		var x, y, vL, vV, a;
		var lastfL, lastfV;
		var reset = function() {
			x = 0;
			y = yinit;
			vL = vinit;
			vV = 0;
			a = 0;
		};
		reset();
		

		var pseudoRandom = function(x) {
			return Math.abs((((1.2345 * x % 0.33) + (6.322 * x % 0.33) + (3.87 * x % 0.33)) % 1)) - 0.5;
		};

		function height(x, delta) {
			var prevStep = Math.floor(x/stepLength)*stepLength;
			var left = prevStep, right = prevStep + stepLength;
			var leftHeight = -left * slope, rightHeight = -right * slope;

			while (right - left > delta) {
				var middle = (left + right) / 2;
				var middleHeight = (leftHeight + rightHeight) / 2;
				middleHeight += (right - left) * pseudoRandom(middle) * randomStrength;
				if (x < middle) {
					right = middle;
					rightHeight = middleHeight;
				} else {
					left = middle;
					leftHeight = middleHeight;
				}
			}
			return (leftHeight + rightHeight) / 2;
		};


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
			info.push('vitesse : ' + (Math.sqrt(vL*vL+vV*vV)*3.6).toFixed(1) + ' km/h');
			info.push('fps : ' + (1000/ (newRenderTime-lastRenderTime)).toFixed(0));
			$info.html(info.join('<br/>'));
			lastRenderTime = newRenderTime;

			//clear
			ctx.fillStyle = 'lightblue';
			ctx.fillRect(0, 0, canvasW, canvasH);

			//moutain
			ctx.fillStyle = 'brown';
			ctx.beginPath();
			var offsetXPx = Math.floor(x * zoom - planePosX);
			var offsetYPx = Math.floor(y * zoom + planePosY);
			ctx.moveTo(0, canvasH - 1);
			for(var j = 0; j < canvasW; j++) {
				var delta = 1 / zoom;
				var xReal = (offsetXPx + j) / zoom;
				var heightPx = zoom * height(xReal, delta);
				ctx.lineTo(j, offsetYPx - heightPx);
			}
			ctx.lineTo(canvasW - 1, canvasH - 1);
			ctx.closePath();
			ctx.fill();

			//plane
			ctx.save();
			ctx.translate(planePosX, planePosY);
			ctx.scale(screenPlaneLength, screenPlaneLength);
			ctx.rotate(-a);
			//speed and force
			ctx.save();
			ctx.lineWidth = 1e-2;
			//speed
			ctx.save();
			ctx.strokeStyle = 'green';
			var attackAngle = computeAttackAngle(vL, vV);
			var speed = Math.sqrt(vL*vL + vV*vV);
			ctx.scale(speed, speed);
			ctx.scale(3e-2, -3e-2);
			ctx.rotate(-attackAngle);
			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.lineTo(1, 0);
			var arrowW = 0.15;
			ctx.moveTo(1-arrowW, arrowW);
			ctx.lineTo(1, 0);
			ctx.lineTo(1-arrowW, -arrowW);
			ctx.stroke();
			ctx.restore();
			//force
			ctx.save();
			ctx.strokeStyle = 'red';
			var force = Math.sqrt(lastfL*lastfL + lastfV*lastfV);
			var angle = computeAttackAngle(lastfL, lastfV);
			ctx.scale(force, force);
			ctx.scale(1e-3, -1e-3);
			ctx.rotate(-angle);
			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.lineTo(1, 0);
			var arrowW = 0.15;
			ctx.moveTo(1-arrowW, arrowW);
			ctx.lineTo(1, 0);
			ctx.lineTo(1-arrowW, -arrowW);
			ctx.stroke();
			ctx.restore();

			ctx.restore();


			ctx.scale(-1, 1);
			ctx.drawImage(planeImage, -0.5,-11.5/49,1,23/49);
			ctx.restore();
			requestAnim();
		};
		requestAnim();


		//keyboard
		window.onkeydown = function(event) {
			switch(event.which) {
				case 40:
					angularSpeedSign = 1;
					break;
				case 38:
					angularSpeedSign = -1;
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
});
