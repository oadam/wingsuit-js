$(document).ready(function() {
		//mountain shape		
		var stepLength = 600;if (stepLength === 0) throw 'stepLength 0';
		var randomStrength = 0.9;
		var slope = 1/3;

		//controls
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
		var planeImageSrc = 'http://smiliesworld.fr/smileys/superman.gif';
		var screenPlaneLength = 30;//px

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

		var computeAttackAngle = function() {
			return - ((vL === 0) ? Math.PI/2 : Math.atan(vV/vL)) + ((vL > 0) ? 0 : Math.PI);
		};

		var update = function(step) {
			'use strict';

			var cosA = Math.cos(a), sinA = Math.sin(a);

			var fL = 0, fV = 0;

			//gravity
			fL -= M * g * sinA;
			fV -= M * g * cosA;

			var attackAngle = computeAttackAngle();
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

			//actual updates
			vL += fL * step / M;
			vV += fV * step / M;

			x += vL * cosA * step - vV * sinA * step;
			y += vL * sinA * step + vV * cosA * step;
		};

		//physics loop
		var lastUpdated = $.now();
		interval = setInterval(function() {
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


		var canvas = $('<canvas/>').appendTo(document.body);
		canvas = canvas[0];
		canvas.width = Math.floor($(window).width()* 0.9);
		canvas.height = Math.floor($(window).height()*0.8);
		var canvasW = canvas.width;
		var canvasH = canvas.height;
		var ctx = canvas.getContext('2d');
		var $info = $('<p/>').appendTo(document.body);

		var x = 0, y = 0;
		var vL = vinit, vV = 0;
		var a = 0;

		var pseudoRandom = function(x) {
			return Math.abs((((1.2345 * x % 0.33) + (6.322 * x % 0.33) + (3.87 * x % 0.33)) % 1)) - 0.5;
		};

		var height = function(x, delta) {
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
			var offsetX = Math.floor(x - canvasW/2);
			var offsetY = Math.floor(y + canvasH/2);
			ctx.moveTo(0, offsetY - height(offsetX, 1));
			for(var j = 1; j < canvasW; j++) {
				ctx.lineTo(j, offsetY - height(offsetX + j, 1));
			}
			ctx.lineTo(canvasW - 1, canvasH - 1);
			ctx.lineTo(0, canvasH - 1);
			ctx.closePath();
			ctx.fill();

			//plane
			ctx.save();
			ctx.translate(canvasW/2, canvasH/2);
			ctx.rotate(-a);
			ctx.scale(screenPlaneLength, screenPlaneLength);
			ctx.scale(-1, 1);
			//ctx.drawImage(planeImage, 0,0);
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
