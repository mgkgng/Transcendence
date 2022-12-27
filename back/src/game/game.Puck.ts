import { Room } from "./game.Room";
import { PaddleSize, PongConfig, PuckSpeed } from "./game.utils";

export class Puck {
	puckSpeed: number;
	pos: Array<number>;
	vec: Array<number>;
	mapSize: Array<number>;

	constructor(mapSize : Array<number>, puckSpeed: number) { // temporary test
		this.puckSpeed = puckSpeed;
		this.vec = [(Math.floor(Math.random() * 4) + 1) * ((Math.floor(Math.random() * 2)) ? 1 : -1),
			puckSpeed * ((Math.floor(Math.random() * 2)) ? 1 : -1)];
		this.mapSize = mapSize;
		this.pos = [mapSize[0] / 2, mapSize[1] / 2];
	} 

	setCheckPuck(room: any) {
		if (room.isOver)
			return ;
		let distToDeath = (this.mapSize[1] / 2 - PongConfig.PaddleHeight - PongConfig.DeadZoneHeight) * 2;
		let frameNb = Math.floor(Math.abs((distToDeath / this.vec[1])));

		let timeOut = frameNb * PongConfig.FrameDuration;
		let deathPointX = this.calculPosX(frameNb);

		setTimeout(() => {
			let player = room.players.get(room.playerIndex[(this.vec[1] > 0) ? 1 : 0]);
			if (!player || room.isOver)
				return ;
			let paddlePos = player.paddle.pos;
			console.log(paddlePos, deathPointX);
			if (deathPointX > paddlePos && deathPointX < paddlePos + PaddleSize[room.gameInfo.paddleSize]) {
				// if paddle hits the puck
				room.broadcast("PuckHit");
				this.pos[0] = deathPointX;
				this.pos[1] = (this.vec[1] > 0) ? (this.mapSize[1] - PongConfig.DeadZoneHeight - PongConfig.PaddleHeight)
					: PongConfig.DeadZoneHeight + PongConfig.PaddleHeight;
				this.vec[1] *= -1;
				this.setCheckPuck(room);
				return ;
			} else {
				// if not, update the score, if the score reached the max point, finish the match
				let winner = (this.vec[1] > 0) ? room.players.get(room.playerIndex[0]) : room.players.get(room.playerIndex[1]);
				if (!winner || room.isOver)
					return ;
				room.broadcast("ScoreUpdate", winner?.info.username);
				winner.score++;

				if (winner.score == room.gameInfo.maxPoint) {
					room.broadcast("GameFinished",  winner.info.username);
					room.endGame(winner.info.username);
					return ;
				}

				setTimeout(() => { Room.startPong(room); }, 2000);
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
		console.log("check deathpoint", this.mapSize[0] - deathPointX);
		return (this.mapSize[0] - deathPointX);
	}
}