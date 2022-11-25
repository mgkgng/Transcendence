import { Paddle } from "./game.Paddle";

export class Player {
	username: string;
	info: any;
	isHost: boolean;
	score: number;
	index: number;
	paddle: Paddle;
	control: Array<any>;

	constructor(userInfo: any, isHost: boolean, index: number, mapSize: Array<number>, paddleWidth: number) {
		this.username = userInfo.username_42;
		this.info = userInfo;
		this.isHost = isHost;
		this.score = 0;
		this.index = index;
		this.paddle = new Paddle(mapSize, paddleWidth);
		this.control = [undefined, undefined];
	}
}