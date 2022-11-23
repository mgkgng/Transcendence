import { Room } from "./game.Room";
import { PongConfig } from "./game.utils";

export class Puck {
	puckSpeed: number;
	pos: Array<number>;
	vec: Array<number>;
	mapSize: Array<number>;

	constructor(mapSize : Array<number>, puckSpeed: number) { // temporary test
		this.puckSpeed = puckSpeed;
		this.vec = [(Math.floor(Math.random() * 3) + 1) * ((Math.floor(Math.random() * 2)) ? 2 : -2),
			puckSpeed * ((Math.floor(Math.random() * 2)) ? 1 : -1)];
		this.mapSize = mapSize;
		this.pos = [mapSize[0] / 2, mapSize[1] / 2];
	}

	setCheckPuck(room: any) {
		let distToDeath = (this.vec[1] > 0)
			? (this.mapSize[1] - PongConfig.DeadZoneHeight - PongConfig.PaddleHeight) - this.pos[1]
			: this.pos[1] - PongConfig.DeadZoneHeight - PongConfig.PaddleHeight; // it functions well
		
		let frameNb = Math.floor(Math.abs((distToDeath / this.vec[1])));

		let timeOut = frameNb * PongConfig.FrameDuration;
		let deathPointX = this.calculPosX(frameNb);

		setTimeout(() => {
			let paddlePos = (this.vec[1] > 0) ? room.pong.paddlePos[1] : room.pong.paddlePos[0];
			if (deathPointX > paddlePos && deathPointX < paddlePos + room.pong.paddleSize) {
				room.broadcast("PuckHit");
				this.pos[0] = deathPointX;
				this.pos[1] = (this.vec[1] > 0) ? (this.mapSize[1] - PongConfig.DeadZoneHeight - PongConfig.PaddleHeight)
					: PongConfig.DeadZoneHeight + PongConfig.PaddleHeight;
				this.vec[1] *= -1;
				this.setCheckPuck(room);
				return ;
			} else {	
				let winner = (this.vec[1] > 0) ? 0 : 1;
				room.broadcast("ScoreUpdate", { scoreTo: winner });
				room.scores[winner]++;

				if (room.scores[0] == room.maxpoint || room.scores[1] == room.maxpoint) {
					room.broadcast("GameFinished", { winner: winner });
					room.putScore();
					return ;
				}

				room.pong.puck = new Puck(room.pong.size, room.pong.puckSpeed);
				setTimeout(() => {
					Room.startPong(room);
				}, 2000);
			}
		}, timeOut);
	}

	calculPosX(frameNb: number) {
		// TODO precision should be made, it should be because of the css stuff
		let deathPointX = this.pos[0];

		for (let i = 0; i < frameNb; i++) {
			deathPointX += this.vec[0];
			if (deathPointX < 0 || deathPointX > this.mapSize[0] - PongConfig.PuckSize) {
				this.vec[0] *= -1;
				deathPointX += this.vec[0];
			}
		}
		return (deathPointX);
	}
}