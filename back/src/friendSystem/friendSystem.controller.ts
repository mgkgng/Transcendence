import { Controller, Get, Inject, Query } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { parse } from "path";
import { first } from "rxjs";
import { UserEntity } from "src/entity/User.entity";
import { UserFriendEntity } from "src/entity/UserFriend.entity";
import { Repository } from "typeorm";
import { friendSystemService } from "./friendSystem.service";
import { MainServerService } from "src/mainServer/mainServer.gateway";

@Controller()
export class friendSystemController {
    constructor(
        @InjectRepository(UserEntity)
        private userRepository : Repository<UserEntity>,
        @InjectRepository(UserFriendEntity)
        private userFriendRepository : Repository<UserFriendEntity>,
        @Inject(friendSystemService)
        private friendSystemService : friendSystemService,
        @Inject(MainServerService)
        private mainServerService : MainServerService
    ) {}

    @Get('addFriend')
    async handleMakeFriend()
    {
        const qb = this.userFriendRepository.createQueryBuilder('u');
        const qbu = this.userRepository.createQueryBuilder('u');

        const newUserRel = new UserFriendEntity();
        newUserRel.id_first_user = await qbu.select().where("u.username = 'John'").getOneOrFail();
        newUserRel.id_second_user = await qbu.select().where("u.username = 'bobby'").getOneOrFail();
        newUserRel.is_user_friend = true;
        return this.userFriendRepository.save([newUserRel]);
        
    }
    
    @Get("debugUserFriendList")
    async debugUserFriendList()
    {
        const qb = this.userFriendRepository.createQueryBuilder('u');
        const qbu = this.userRepository.createQueryBuilder('u');
        return await this.userFriendRepository.find({relations: ['id_first_user', 'id_second_user']})
    }

    @Get("debugUser")
    async debugUserList()
    {
        const qb = this.userFriendRepository.createQueryBuilder('u');
        const qbu = this.userRepository.createQueryBuilder('u');
        return await this.userRepository.find({relations:{relation_friend_requested: true, relation_friend_accepted: true}})
    }

    @Get("addtest")
    async addNew()
    {
        let user = new UserEntity;
        user.username = "test";
		user.username_42 = "test";
		user.display_name = "test";
		user.campus_country = "France";
		user.campus_name = "42Nice";
        user.password = "testpass";
        user.email = "test@test.fr";
        return await this.userRepository.save(user);
    }

	@Get("add5users")
	async add5users()
	{
		let user = new UserEntity;
		user.username = "mohamed";
		user.username_42 = "mohamed";
		user.display_name = "mohamed";
		user.campus_country = "France";
		user.campus_name = "42Nice";
		user.password = "mohamedpass";
		user.email = "mohamed@mohamed.fr";

		let user2 = new UserEntity;
		user2.username = "timmy";
		user2.username_42 = "timmy";
		user2.display_name = "timmy";
		user2.campus_country = "France";
		user2.campus_name = "42Nice";
		user2.password = "timmypass";
		user2.email = "timmy@timmy.fr";

		let user3 = new UserEntity;
		user3.username = "lisa";
		user3.username_42 = "lisa";
		user3.display_name = "lisa";
		user3.campus_country = "France";
		user3.campus_name = "42Nice";
		user3.password = "lisapass";
		user3.email = "lisa@lisa.fr";
	
		let user4 = new UserEntity;
		user4.username = "clara";
		user4.username_42 = "clara";
		user4.display_name = "clara";
		user4.campus_country = "France";
		user4.campus_name = "42Nice";
		user4.password = "clarapass";
		user4.email = "clara@clara.fr";

		let user5 = new UserEntity;
		user5.username = "anthony";
		user5.username_42 = "anthony";
		user5.display_name = "anthony";
		user5.campus_country = "France";
		user5.campus_name = "42Nice";
		user5.password = "anthonypass";
		user5.email = "anthony@anthony.fr";

		return await this.userRepository.save([user, user2, user3, user4, user5]);
	}

	@Get("friendwithmin")
	async friendwithmin()
	{
		const qbu = this.userRepository.createQueryBuilder('u');
		const user = await qbu.select().where("u.username = 'mohamed'").getOneOrFail();
		const user2 = await qbu.select().where("u.username = 'timmy'").getOneOrFail();
		const user3 = await qbu.select().where("u.username = 'lisa'").getOneOrFail();
		const user4 = await qbu.select().where("u.username = 'clara'").getOneOrFail();
		const user5 = await qbu.select().where("u.username = 'anthony'").getOneOrFail();
		const min = await qbu.select().where("u.username = 'min-kang'").getOneOrFail();
		// const hadufer = await qbu.select().where("u.username = 'hadufer'").getOneOrFail();

		const newUserRel = new UserFriendEntity();
		newUserRel.id_first_user = user;
		newUserRel.id_second_user = min;
		newUserRel.is_user_friend = true;

		const newUserRel2 = new UserFriendEntity();
		newUserRel2.id_first_user = user2;
		newUserRel2.id_second_user = min;
		newUserRel2.is_user_friend = true;

		const newUserRel3 = new UserFriendEntity();
		newUserRel3.id_first_user = user3;
		newUserRel3.id_second_user = min;
		newUserRel3.is_user_friend = true;

		const newUserRel4 = new UserFriendEntity();
		newUserRel4.id_first_user = user4;
		newUserRel4.id_second_user = min;
		newUserRel4.is_user_friend = true;

		const newUserRel5 = new UserFriendEntity();
		newUserRel5.id_first_user = user5;
		newUserRel5.id_second_user = min;
		newUserRel5.is_user_friend = true;

		return await this.userFriendRepository.save([newUserRel, newUserRel2, newUserRel3, newUserRel4, newUserRel5]);
	}
    @Get("isfriendwith?")
    async isFriendWithByUsername(@Query() query : {first_username : string, second_username : string})
    {
        return this.friendSystemService.isFriendWithByUsername(query.first_username, query.second_username);
    }

    @Get("getFriendList?")
    async getFriendList(@Query() query : {username : string })
    {
        return this.friendSystemService.getFriendList(query.username);
    }

    @Get("askfriend?")
    async askFriend(@Query() query : {first_username : string, second_username : string})
    {
        return this.friendSystemService.askFriend(query.first_username, query.second_username);
    }

    @Get('unaskfriend?')
    async unaskFriend(@Query() query : {first_username : string, second_username : string})
    {
        return this.friendSystemService.unAskFriend(query.first_username, query.second_username);
    }

    @Get('unfriend?')
    async unfriend(@Query() query : {first_username : string, second_username : string})
    {
        console.log("unfriend", query);
        return this.friendSystemService.unFriend(query.first_username, query.second_username);
    }

    @Get('changeStatus?')
    async changeStatus(@Query() query : {username : string, status : string})
    {
        return this.friendSystemService.changeStatus(query.username, query.status);
    }
}