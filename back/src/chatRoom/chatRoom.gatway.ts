import { JwtService } from "@nestjs/jwt";
import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer, WsException } from "@nestjs/websockets";
import { Socket } from 'socket.io';
import { ChatRoomEntity } from "src/entity/ChatRoom.entity";
import { MessageChatRoomEntity } from "src/entity/MessageChatRoom.entity";
import { UserEntity } from "src/entity/User.entity";
import { UserChatRoomEntity } from "src/entity/UserChatRoom.entity";
import { DataSource } from "typeorm";
import { MainServerService } from "../mainServer/mainServer.gateway";
import { UseGuards, Request, HttpException } from '@nestjs/common';
import { AuthGuard } from "@nestjs/passport";
import * as bcrypt from 'bcrypt';

@WebSocketGateway({
	cors: {
	  origin: '*',
	},
})
export class ChatRoomService {
	constructor(
		private dataSource : DataSource,
		private jwtServer: JwtService, 
		private mainServer: MainServerService,
	){
	}
	@WebSocketServer() server;

	//@UseGuards(AuthGuard('jwt'))
	async handleConnection(@Request() req)
	{
		const client : Socket = req;
		console.log('Connect');
		console.log('Connect is here');
		try {
			console.log("error here");
			const names = await this.mainServer.getNamesRoomsForUser(req);
			console.log(names);
			for (let n of names) //ADD USER TO HIS ROOMS
			{
				const name : string = n.room.name;
				console.log("Join => ", n.room.name);
				client.join(n.room.name);
			}
		} catch (e) { console.log("error"); return (e); }
		return ("connect");
	}

	
	//OK
	//Create new room with current socker user as admin
	//{room_name: string, is_password_protected: bool, room_password: string}
	@SubscribeMessage('new_room')
	async creat_room(@MessageBody() data: any, @Request() req, @ConnectedSocket() client : Socket)
	{
		//console.log("new room");
		const id_user = await this.mainServer.getIdUser(req);
		const is_password_protected : boolean = data.is_password_protected;	
		const password : string = is_password_protected ? 
			await bcrypt.hash(data.room_password, 10) 
			: "";
		const name : string = data.room_name;
		const date_creation : Date = new Date();
		const  querry = this.dataSource.createQueryRunner(); 
		try{
			const new_chat_room = new ChatRoomEntity();
			new_chat_room.name = name;
			new_chat_room.date_creation = date_creation;
			new_chat_room.is_password_protected = is_password_protected;
			new_chat_room.password = password;
			const res_chat_room : any = await this.dataSource.getRepository(ChatRoomEntity).save(new_chat_room);
			console.log(res_chat_room);
			const new_user_chat_room = new UserChatRoomEntity();
			new_user_chat_room.id_user = id_user;
			new_user_chat_room.room = res_chat_room.id_g;
			new_user_chat_room.is_admin = true;
			new_user_chat_room.is_banned = false;
			new_user_chat_room.is_muted = false;
			const res_user_chat_room = await this.dataSource.getRepository(UserChatRoomEntity).save(new_user_chat_room);
			client.join(name);
			console.log("Create room finish");
			client.emit("new_room", {	room_name: name	});
		} catch (e) {
			console.log("Create room error");
			client.emit("error_new_room", {error: "Room already exist"});
			throw new WsException("Room already exist");
		}
	}
	//OK
	//Add user to a room 
	//{room_name: string, username: string, room_password? : string}
	@SubscribeMessage('append_user_to_room')
	async append_user_to_room(@MessageBody() data: any, @ConnectedSocket() client: Socket, @Request() req)
	{
		try{
			const id_user = await this.mainServer.getIdUser(req);
			const id_room = await this.mainServer.getIdRoom(data);
			const room = await this.dataSource.getRepository(ChatRoomEntity).createQueryBuilder("room").
			where("room.id_g = :id ", {id: id_room}).getOne();
			const is_good_password = await bcrypt.compare(data.room_password, room.password);
			if (room.is_password_protected && !is_good_password) //Test password
			{
				client.emit("error_append_user_to_room", {error: "Bad password"});
				throw new WsException("Bad password");
			}
			const is_already_in = await this.dataSource.getRepository(UserChatRoomEntity).createQueryBuilder("userRoom").
			where("userRoom.room = :id and userRoom.id_user = :id_u", {id: id_room, id_u : id_user}).getOne();
			if (is_already_in != undefined) //Client already in room => just make this room visible for him
			{
				const res = await this.dataSource.createQueryBuilder().update(UserChatRoomEntity)
				.where("id_user = :u AND room = :r", {u: id_user, r: id_room})
				.set({is_visible: true}).execute(); //UPDATE is_visible
				client.join(data.room_name); 		//JOIN ROOM (socket.io rooms)
				client.emit("set_room_visible", {room_name: room.name});
				return;
			}
			const res_user_chat_room = await this.dataSource.createQueryBuilder().insert().into(UserChatRoomEntity).values
			([ 
				{id_user: id_user, room: id_room, is_admin: false, is_banned: false, is_muted: false}
			]).execute(); //Add user to the room
		}
		catch(e){
			console.log("getMessage Error: bad data");
			throw new WsException("Bad data");
		}
	}
	//OK
	//Get all user for a room
	//{room_name: string}
	@SubscribeMessage('get_users_room')
	async get_users_room(@MessageBody() data: any, @ConnectedSocket() client: Socket, @Request() req)
	{
		try{
			const id_user = await this.mainServer.getIdUser(req);
			const id_room = await this.mainServer.getIdRoom(data);
			try{
				const res_is_in_room = await this.dataSource.getRepository(UserChatRoomEntity).createQueryBuilder("userChat")
				.where("userChat.id_user = :u", {u : id_user})
				.andWhere("userChat.room = :r", {r: id_room}).getMany();
				if (!res_is_in_room.length)
				{
					client.emit("error_get_users_room", {error: "You are not in this room"});
					throw new WsException("Not in the room");
				}
				if (res_is_in_room[0].is_banned && res_is_in_room[0].ban_end > new Date())
				{
					client.emit("error_get_users_room", {error: "You are banned"});
					throw new WsException("Your are ban");
				}
				const res = await this.dataSource.getRepository(MessageChatRoomEntity).createQueryBuilder("userChatRoomEntity")
				.innerJoin("userChatRoomEntity.room", "chatRoom")
				.innerJoin("userChatRoomEntity.id_user", "user")
				.select(["user.username"])
				.where("chatRoom.id_g = :id", {id: id_room}).getMany();
				//console.log(res);
				client.emit('get_message_room', {messages : res, room_name: data.room_name});
			} catch (e) {
				client.emit("error_get_users_room", {error: "Error data"});
			}
		}catch(e){
			console.log("getMessage Error: bad data");
			throw new WsException("Bad data");
		}
	}
	//OK
	//Get all messages in room (Error if current socket user is not in the room)
	//{room_name: string }
	@SubscribeMessage('get_message_room')
	async getMessageRoom(@MessageBody() data: any, @ConnectedSocket() client: Socket, @Request() req) 
	{
		try{
			const id_user = await this.mainServer.getIdUser(req);
			const id_room = await this.mainServer.getIdRoom(data);
			try{
				const res_is_in_room = await this.dataSource.getRepository(UserChatRoomEntity).createQueryBuilder("userChat")
				.where("userChat.id_user = :u", {u : id_user})
				.andWhere("userChat.room = :r", {r: id_room}).getMany();
				if (!res_is_in_room.length)
				{
					client.emit("error_get_message_room", {error: "You are not in this room"});
					throw new WsException("Not in the room");
				}
				if (res_is_in_room[0].is_banned && res_is_in_room[0].ban_end > new Date())
				{
					client.emit("error_get_message_room", {error: "You are banned"});
					throw new WsException("Your are ban");
				}
				const res = await this.dataSource.getRepository(MessageChatRoomEntity).createQueryBuilder("messageChatRoomEntity")
				.innerJoin("messageChatRoomEntity.id_chat_room", "chatRoom")
				.innerJoin("messageChatRoomEntity.id_user", "user")
				.select(["messageChatRoomEntity.content_message", "messageChatRoomEntity.date_message", "user.username", "chatRoom.name"])
				.where("chatRoom.id_g = :id", {id: id_room}).orderBy("messageChatRoomEntity.date_message", "ASC").getMany();
				//console.log(res);
				client.emit('get_message_room', {messages : res, room_name: data.room_name});
			} catch (e) {
				console.log("getMessage Error");
				console.log(e);
				throw new WsException("No message in this room");
			}
		}catch(e){
			console.log("getMessage Error: bad data");
			throw new WsException("Bad data");
		}
	}
	//Get a page of messages in room (Error if current socket user is not in the room)
	//{room_name: string, page_number: number, size_page: number }
	@SubscribeMessage('get_message_room_page')
	async getMessageRoomPage(@MessageBody() data: any, @ConnectedSocket() client: Socket, @Request() req) 
	{
		try{
			const id_user = await this.mainServer.getIdUser(req);
			const id_room = await this.mainServer.getIdRoom(data);
			try{
				const res_is_in_room = await this.dataSource.getRepository(UserChatRoomEntity).createQueryBuilder("userChat")
				.where("userChat.id_user = :u", {u : id_user})
				.andWhere("userChat.room = :r", {r: id_room}).getMany();
				if (!res_is_in_room.length)
					throw new WsException("Not in the room");
				if (res_is_in_room[0].is_banned && res_is_in_room[0].ban_end > new Date())
				{
					client.emit("error_get_message_room_page", {error: "You are banned"});
					throw new WsException("Your are ban");
				}
				const res = await this.dataSource.getRepository(MessageChatRoomEntity).createQueryBuilder("messageChatRoomEntity")
				.innerJoin("messageChatRoomEntity.id_chat_room", "chatRoom")
				.innerJoin("messageChatRoomEntity.id_user", "user")
				.select(["messageChatRoomEntity.content_message", "messageChatRoomEntity.date_message", "user.username", "chatRoom.name"])
				.where("chatRoom.id_g = :id", {id: id_room}).orderBy("messageChatRoomEntity.date_message", "DESC")
				.offset((parseInt(data.page_number) - 1) * parseInt(data.size_page))
				.limit(parseInt(data.size_page))
				.getMany();
				console.log(res);
				client.emit('get_message_room', res);
			} catch (e) {
				console.log("getMessage Error");
				console.log(e);
				throw new WsException("No message in this room");
			}
		}catch(e){
			console.log("getMessage Error: bad data");
			throw new WsException("Bad data");
		}
	}
	//OK	
	//Add message in a room (Error if current socket user is not in the room)
	//{room_name: string, content_message: string}
	@SubscribeMessage('new_message_room')
	async newMessageRoom(@MessageBody() data: any, @ConnectedSocket() client: Socket, @Request() req)
	{
		const id_user = await this.mainServer.getIdUser(req);
		const id_room = await this.mainServer.getIdRoom(data);
		const message : any = data.content_message;
		const date_creation : Date = new Date();
		const user : any = (this.jwtServer.decode(req.handshake.headers.authorization.split(' ')[1]));
		const client_username = user.username;
		const  querry = this.dataSource.createQueryRunner(); 
		try{
			const res = await this.dataSource.getRepository(UserChatRoomEntity).createQueryBuilder("userChat")
			.where("userChat.id_user = :u", {u : id_user})
			.andWhere("userChat.room = :r", {r: id_room}).getMany();
			if (!res.length)
				throw new WsException("Not in the room");
			if (res[0].is_banned && res[0].ban_end > new Date())
			{

				client.emit("error_new_message_room", {error: "You are banned"});
				throw new WsException("You are ban of the room");
			}
			if (res[0].is_muted && res[0].mute_end > new Date())
			{
				client.emit("error_new_message_room", {error: "You are muted"});
				throw new WsException("You are mute");
			}
			const newMessage = new MessageChatRoomEntity();
			newMessage.id_user = id_user;
			newMessage.id_chat_room = id_room;
			newMessage.content_message = message;
			newMessage.date_message = date_creation;
			const res_insert_message = await this.dataSource.getRepository(MessageChatRoomEntity).save(newMessage);
			console.log(res_insert_message);
			//await querry.commitTransaction();
			this.server.to(data.room_name).emit('new_message_room', {room_name : data.room_name, content_message: data.content_message, username: client_username, date_message: date_creation});
		} catch (e) {
			//await querry.rollbackTransaction();
			console.log("Can't create message");
			client.emit("error_new_message_room", {error: "Can't create message"});
			throw new WsException("Can't send message");
		}
	}
	//OK
	//Get all rooms for the current socket user
	//{}
	@SubscribeMessage('get_my_rooms')
	async getMyRoom(@MessageBody() data, @ConnectedSocket() client: Socket)
	{
		const res : any = await this.mainServer.getNamesRoomsForUser(client);
		console.log("My rooms:", res);
		let name : string[] = [];
		for (let n of res)
		{
			const inter : string = (n.room.name);
			name.push(inter);
		}
		client.emit("get_my_rooms", name);
	}
	//OK
	//Get all rooms in the databases
	//{}
	@SubscribeMessage('get_all_rooms')
	async getAllRooms(@MessageBody() data, @ConnectedSocket() client: Socket)
	{
		const res = await this.dataSource.getRepository(ChatRoomEntity)
		.createQueryBuilder("chatRoom")
		.where("chatRoom.is_private = :p", {p: false})
		.select(["chatRoom.name", "chatRoom.is_password_protected"]).getMany();
		//console.log(res);
		client.emit("get_all_rooms", res);
	}
	//OK
	//Get all rooms in the databases
	//{research: string}
	@SubscribeMessage('get_all_rooms_begin_by')
	async getAllRoomsBeginBy(@MessageBody() data, @ConnectedSocket() client: Socket)
	{
		const res = await this.dataSource.getRepository(ChatRoomEntity)
		.createQueryBuilder("chatRoom")
		.select(["chatRoom.name", "chatRoom.is_password_protected"])
		.where("substr(chatRoom.name, 1, :l) = :s", {l: data.research.length, s: data.research})
		.andWhere("chatRoom.is_private = :p", {p: false})
		.getMany();
		console.log(res);
		client.emit("get_all_rooms", res);
	}
	//Ban a user if current socket user is Admin on the room 
	//{room_name:string, username_ban: string, ban_end: Date}
	@SubscribeMessage('ban_user')
	async setBanUser(@MessageBody() data, @ConnectedSocket() client: Socket, @Request() req)
	{
			let ban_end = data.mute_end;
			if (ban_end == undefined)
				ban_end = new Date(2999, 12, 31);
			const jwt : any = (this.jwtServer.decode(req.handshake.headers.authorization.split(' ')[1]));
			const user : any = await this.dataSource.getRepository(UserEntity).find({where: {username_42: jwt.username_42}});
			const user_ban : any = await this.dataSource.getRepository(UserEntity).find({where: {username: data.username_ban}});
			const room : any = await this.dataSource.getRepository(ChatRoomEntity).find({where: {name: data.room_name}});

			const is_admin = await this.dataSource.getRepository(UserChatRoomEntity).createQueryBuilder("userRoom")
			.where("userRoom.id_user = :u AND userRoom.room = :r", {u: user[0].id_g, r: room[0].id_g})
			.select("userChat.is_admin").getMany();
			if (!is_admin[0].is_admin)
			{
				client.emit("error_ban_user", {error: "You are not admin of the room"});
				throw new WsException("You are not admin");
			}
			else
			{
				const res = await this.dataSource.createQueryBuilder().update(UserChatRoomEntity)
				.set({is_banned: true, ban_end: ban_end})
				.where("id_user = :u AND room = :r", {u: user_ban[0].id_g, r: room[0].id_g})
				.execute();
				client.emit("ban_user", data);
			}
	}
	//OK
	//Mute a user if current socket user is Admin on the room 
	//{room_name:string, username_ban: string, mute_end: Date}
	@SubscribeMessage('mute_user')
	async setMuteUser(@MessageBody() data, @ConnectedSocket() client: Socket, @Request() req)
	{
			let mute_end = data.mute_end;
			if (mute_end == undefined)
				mute_end = new Date(2999, 12, 31);
			const jwt : any = (this.jwtServer.decode(req.handshake.headers.authorization.split(' ')[1]));
			const user : any = await this.dataSource.getRepository(UserEntity).find({where: {username_42: jwt.username_42}});
			const user_ban : any = await this.dataSource.getRepository(UserEntity).find({where: {username: data.username_ban}});
			const room : any = await this.dataSource.getRepository(ChatRoomEntity).find({where: {name: data.room_name}});

			const is_admin = await this.dataSource.getRepository(UserChatRoomEntity).createQueryBuilder("userRoom")
			.where("userRoom.id_user = :u AND userRoom.room = :r", {u: user[0].id_g, r: room[0].id_g})
			.select("userRoom.is_admin").getMany();
			if (!is_admin[0].is_admin)
			{
				client.emit("error_ban_user", {error: "You are not admin of the room"});
				throw new WsException("You are not admin");
			}
			else
			{
				const res = await this.dataSource.createQueryBuilder().update(UserChatRoomEntity)
				.set({is_muted: true, mute_end: mute_end})
				.where("id_user = :u AND room = :r", {u: user_ban[0].id_g, r: room[0].id_g})
				.execute();
				client.emit("mute_user", data);
			}
	}
	//OK
	//Set other user as admin if current socket user is Admin on the room 
	//{room_name:string, username_new_admin: string}
	@SubscribeMessage('set_admin')
	async setAdminUser(@MessageBody() data, @ConnectedSocket() client: Socket, @Request() req)
	{
			const client_username : any = (this.jwtServer.decode(req.handshake.headers.authorization.split(' ')[1]));
			const user : any = await this.dataSource.getRepository(UserEntity).find({where: {username_42: client_username.username_42}});
			const user_ban : any = await this.dataSource.getRepository(UserEntity).find({where: {username: data.username_new_admin}});
			const room : any = await this.dataSource.getRepository(ChatRoomEntity).find({where: {name: data.room_name}});

			const is_admin = await this.dataSource.getRepository(UserChatRoomEntity).createQueryBuilder("userRoom")
			.where("userRoom.id_user = :u AND userRoom.room = :r", {u: user[0].id_g, r: room[0].id_g})
			.select("userRoom.is_admin").getMany();
			if (!is_admin[0].is_admin)
			{
				client.emit("error_ban_user", {error: "You are not admin of the room"});
				throw new WsException("You are not admin");
			}
			else
			{
				const res = await this.dataSource.createQueryBuilder().update(UserChatRoomEntity)
				.where("id_user = :u AND room = :r", {u: user_ban[0].id_g, r: room[0].id_g})
				.set({is_admin: true, is_banned: false, is_muted: false}).execute();
				console.log(res);
				client.emit("set_admin", data);
			}
	}
	//Put a room in state "note visible" for a user
	//{room_name:string}
	@SubscribeMessage("set_room_not_visible")
	async setRoomNotVisible(@MessageBody() data, @ConnectedSocket() client: Socket, @Request() req) {
		const user = await this.mainServer.getIdUser(req);
		const room : any = await this.dataSource.getRepository(ChatRoomEntity).find({where: {name: data.room_name}});
		const res = await this.dataSource.createQueryBuilder().update(UserChatRoomEntity)
				.where("id_user = :u AND room = :r", {u: user, r: room[0].id_g})
				.set({is_visible: false}).execute();
		client.emit("set_room_not_visible", {});
	}
	//Put a room in state "visible" for a user
	//{room_name:string}
	@SubscribeMessage("set_room_visible")
	async setRoomVisible(@MessageBody() data, @ConnectedSocket() client: Socket, @Request() req) {
		const client_username : any = (this.jwtServer.decode(req.handshake.headers.authorization.split(' ')[1]));
		const user : any = await this.dataSource.getRepository(UserEntity).find({where: {username: client_username.username_42}});
		const room : any = await this.dataSource.getRepository(ChatRoomEntity).find({where: {name: data.room_name}});
		const res = await this.dataSource.createQueryBuilder().update(UserChatRoomEntity)
				.where("id_user = :u AND room = :r", {u: user[0].id_g, r: room[0].id_g})
				.set({is_visible: true}).execute();
		client.join(data.room_name);
		client.emit("set_room_visible", {});
	}
}