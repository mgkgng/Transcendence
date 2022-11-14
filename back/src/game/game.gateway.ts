import { 
	ConnectedSocket,
	MessageBody,
	OnGatewayConnection,
	OnGatewayDisconnect,
	SubscribeMessage,
	WebSocketGateway, 
	WebSocketServer
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import {Client} from './game.Client'
import {Room} from "./game.Room"
import { UseGuards, Request, HttpException } from '@nestjs/common';
import { AuthGuard } from "@nestjs/passport";
import { UserBlockEntity } from "src/entity/UserBlock.entity";
import { MainServerService } from "src/mainServer/mainServer.gateway";
import { JwtService } from '@nestjs/jwt';
import { GameEntity } from "src/entity/Game.entity";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { replacer } from "./game.utils";
import { UserService } from "src/user/user.service";

@WebSocketGateway({
	cors: {
	  origin: '*',
	},
})
//export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
export class GameGateway {
	clients: Map<string, Client>;
	rooms: Map<string, Room>;
	queue: Array<Client>;
	control: Map<string, any>;

	constructor(private mainServerService : MainServerService, private jwtService: JwtService, 
				@InjectRepository(GameEntity) private gameRep: Repository<GameEntity>,
				private dataSource : DataSource,
				private userService : UserService,
				private jwtServer: JwtService
	) {
		this.clients = new Map<string, Client>();
		this.rooms = new Map<string, Room>();
		this.queue = [];
		this.control = new Map<string, any>();

		// Testing rooms
		// this.addRoomsForTest();
	}

	@WebSocketServer()
	server: Server;

	// addRoomsForTest() {
	// 	let room1 = new Room(['testPlayer1'], 'TestRoom1', 25, 5, false,
	// 		this.gameRep, this.mainServerService, this.dataSource);

	// 	let room2 = new Room(['testPlayer2'], "Welcome to this map", 18, 3, false,
	// 		this.gameRep, this.mainServerService, this.dataSource);
	
	// 	this.rooms.set(room1.id, room1);
	// 	this.rooms.set(room2.id, room2);
	// 	console.log(this.rooms);
	// }

	@UseGuards(AuthGuard("jwt"))
	async handleConnection(client: Socket) { //TODO handle connection here
		console.log("New Connection on site.");
		// i don't know yet how to use well this function
	}

	async handleDisconnect(@ConnectedSocket() client: Socket) { //TODO handle connection here
		console.log("Disconnection...", client.id);
		this.clients.delete(client.id);
	}

	@SubscribeMessage("Connection")
	handleConnexion(@ConnectedSocket() client: Socket, @Request() req) {
		console.log("Connection!!", client.id);
		const user: any = (this.jwtService.decode(req.handshake.headers.authorization.split(' ')[1]));
  		let newClient = new Client(client, user.username, {});
		this.clients.set(newClient.id, newClient);

		// Should send it only once
		client.emit("GetConnectionInfo", {
			id: newClient.id,
			user: {
				username: user.username,
				displayname: user.displayname,
				image_url: user.image_url,
				campus_name: user.campus_name,
				campus_country: user.campus_country
			}
		})
		// Here maybe should be db check - if user is already registered.
	}

	@SubscribeMessage("JoinQueue")
	joinQueue(@MessageBody() data: any) {
		console.log(data);
		console.log("Join Queue", data);
		let client = this.getClient(data);
		//TODO: should maybe optimize the algorithm later -- for includes
		if (client && (client.room.length || this.queue.includes(client)))
			return ;

		this.queue.push(client);

		// TODO plus tard
		if (this.queue.length > 1) {
			let room = new Room([this.queue[0], this.queue[1]], [], "", 1, 10, 1, true, "", this.gameRep, this.mainServerService, this.dataSource, this.userService);
			// TODO: think about it: if i just join a match randomlmy like this, it could be by default a private game
			this.queue[0].room = room.id;
			this.queue[1].room = room.id;

			room.broadcast('MatchFound', room.id);

			this.rooms.set(room.id, room);
			this.queue = this.queue.slice(2);
		}
	}

	@SubscribeMessage("LeaveQueue")
	leaveQueue(@MessageBody() data: any) {
		let index = this.queue.indexOf(this.getClient(data));
		if (index > -1)
			this.queue.splice(index, 1);
		// TODO algo & protection revoir
	}

	@SubscribeMessage("RoomCheck")
	async roomCheck(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
		console.log("RoomCheck", data);

		let room = this.getRoom(data.room);

		if (!room) {
			client.emit("RoomNotFound");
			return ;
		}

		let players = []
		for (let player of room.players) {
			const x = await this.getPlayerInfo(player);
			players.push(x);
		}

		client.emit("RoomInfo", {
			roomHost: room.hostname,
			players: players,
			maxpoint: room.maxpoint,
			scores: room.scores,
			mapSize: [room.pong.size[0], room.pong.size[1]],
			paddleSize: room.pong.paddleSize
		});
	}

	@SubscribeMessage("PaddleMove")
	paddleMove(@MessageBody() data: any) {
		let room = this.getRoom(data.room);

		// calcul algorithm launched here

		let intervalId = setInterval(() => {
			room.pong.movePaddle(data.player, data.left);
			room.broadcast("PaddleUpdate", {
				player: data.player,
				paddlePos: room.pong.paddlePos[data.player]
			});
		}, 20);
		this.control.set(data.client, intervalId);
	}

	@SubscribeMessage("PaddleStop")
	paddleStop(@MessageBody() data: any) {
		clearInterval(this.control.get(data));
		this.control.delete(data);
	}

	@SubscribeMessage("AskRooms")
	askRooms(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
		console.log("AskRooms");
		// let client = this.server.sockets.sockets.get(sock.id);
		// console.log("hahaha: ", sock.id);
		// console.log("=================================");
		// console.log("YOYOYOYOYOYO: ", this.server.sockets.sockets.get(sock.id));
	
		// I need to think more about how i should save the data and how i'll send it
		// there should be at least these information:
		// playersInfo, availability / format (max point, map, mode...)
		// and then if the game is going on...
		// score...
		
		client.emit("GetAllRooms", {
			rooms: JSON.stringify([...this.rooms].filter(room => !room[1].privateMode), replacer())
		});
	}

	@SubscribeMessage("CreateRoom")
	createRoom(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
		console.log("CreateRoom", data);
		
		// TODO should be able to have client's room state
		// if (client.room.length)
		// 	return ;

		let room = new Room([data.username], [client], data.title, data.mapSize, data.maxPoint, data.difficulty, data.privateMode, data.username,
			this.gameRep, this.mainServerService, this.dataSource, this.userService);
		this.rooms.set(room.id, room);

		// TODO should be able to set client's room state
		// client.room = room.id;

		client.emit("RoomCreated", room.id);
	}

	@SubscribeMessage("JoinRoom")
	async joinRoom(@ConnectedSocket() client: Socket, @MessageBody() data: any) {
		let room = this.getRoom(data.roomId);
		if (!room || (room.players.length > 1 && data.play)) {
			client.emit("JoinRoomRes", { allowed: false });
			return ;
		} else if (data.play) {
			room.addPlayer(client, data.username);
			const newPlayer = await this.getPlayerInfo(data.username);
			room.broadcast("PlayerUpdate", {
				join: true,
				userInfo: newPlayer
			});
		} else {
			room.broadcast("WatcherUpdate", { //TODO potentiellement
				join: true
			})
			room.addClient(client);
		}

		client.emit("JoinRoomRes", {
			allowed: true,
			roomId: data.roomId
		});
	}

	@SubscribeMessage("isReady")
	setReady(@MessageBody() data: any, @Request() req) {

		const user : any = (this.jwtServer.decode(req.handshake.headers.authorization.split(' ')[1]));
		let room = this.getRoom(data.roomId);

		if (!room || user.username != room.players[1])//for example
			return ;

		room.ready = data.ready;
		room.broadcast("ReadyUpdate", { ready: room.ready })
	}

	@SubscribeMessage("StartGame")
	startGame(@ConnectedSocket() client: Socket, @MessageBody() data: any, @Request() req) {
		const user : any = (this.jwtServer.decode(req.handshake.headers.authorization.split(' ')[1]));
		let room = this.getRoom(data.roomId);
		if (!room || user.username != room.players[0])
			return ;

		if (!room.ready) {
			client.emit("StartGameFail");
			return ;
		}
		room.broadcast("GameStart", undefined);
		room.startPong();
	}

	static broadcast(clients: any, event: string, data: any) {
		for (let client of clients)
			client.emit(event, data);
	}

	@SubscribeMessage("newChatGameMessage")
	// {roomId: string, content: string}
	async newChatGameMessage(@MessageBody() data: any, @Request() req) {
		let room = this.getRoom(data.roomId);
		const user : any = (this.jwtService.decode(req.handshake.headers.authorization.split(' ')[1]));
		
		room.addMessage(user.username, data.content);
	}

	@SubscribeMessage("getChatGameMessage")
	// {roomId: string}
	async getChatGameMessage(@MessageBody() data: any, @ConnectedSocket() client: Socket) {
		let room = this.getRoom(data.roomId);
		client.emit("getChatGameMessage", room.chat);	
	}

	getClient(id: string) { return (this.clients.get(id)); }
	getRoom(id: string) { return (this.rooms.get(id)); }

	async getPlayerInfo(player: any) {
		const userdata = await this.userService.findOne(player)
		return ({
			username: userdata.username,
			username_42: userdata.username_42,
			displayname: userdata.display_name,
			image_url: userdata.img_url,
			campus_name: userdata.campus_name,
			campus_country: userdata.campus_country,
		});
	}
}