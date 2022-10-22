import { writable } from "svelte/store";
import { browser } from "$app/environment";
import { uid } from "./lib";
import io from "socket.io-client";

class Client {
	id: string;
	socket: any;
	callbacksOnConnection: Set<Function>;
	listeners: Map<string, Function>;

	constructor() {
		this.id = uid();
		this.listeners = new Map();
		this.callbacksOnConnection = new Set();
		this.socket = undefined;
	}

	connect() {
		if (!browser)
			return ;
		
		console.log('Connected');
		
		this.socket.emit("Connection", this.id);
		for (let func of this.callbacksOnConnection)
			func();
	}

	async send42Tok(url: any)
	{
		if (localStorage.getItem('transcendence-jwt') != null
		&& localStorage.getItem('transcendence-jwt') != undefined)
		{
			const tok = localStorage.getItem('transcendence-jwt');
			try
			{
				this.socket = io("http://localhost:3000",{
					extraHeaders: {
						Authorization: "Bearer " + tok,
					}
				});
				this.connect();
				return (true);
			}catch{
				console.log("error");
			}
		}
		if (url.has('code'))
		{
			try {
				const res : any = await fetch("http://localhost:3000/auth42",{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body:JSON.stringify({username: "oui", password: url.get('code')}),
				});
				const tok = await res.json();
				this.socket = io("http://localhost:3000",{
					extraHeaders: {
						Authorization: "Bearer " + tok.access_token,
					}
				});
				localStorage.setItem('transcendence-jwt', tok.access_token);
				this.connect();
				return (true);
			}catch{
				return (false);
			}
		}
		return (false);
	}
}

export const client = writable(new Client());