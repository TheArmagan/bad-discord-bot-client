const path = require("path");
const Discord = require("discord.js");
const CONFIG = require("./config");
const express = require("express");
const eApp = express();
const WebSocket = require("ws");
const wss = new WebSocket.Server({ port: CONFIG.PORT + 1 });
const stuffs = require("stuffs");

function wsSend(event, data) {
  wss.clients.forEach((socket) => {
    socket.send(JSON.stringify([event, data]));
  })
}

eApp.listen(CONFIG.PORT);
eApp.use(express.static(path.resolve(`./web`)));
eApp.use(express.json());

const client = new Discord.Client({
  intents: [
    "DIRECT_MESSAGES",
    "GUILD_MESSAGES",
    "GUILD_MEMBERS",
    "GUILDS",
    "GUILD_WEBHOOKS"
  ],
  makeCache: Discord.Options.cacheWithLimits({
    MessageManager: 200
  })
});

eApp.get("/api/port", async (req, res) => {
  res.send({
    HTTP: CONFIG.PORT,
    WS: CONFIG.PORT + 1
  });
});

eApp.get("/api/client", async (req, res) => {
  res.send({
    username: client.user.username,
    discriminator: client.user.discriminator,
    id: client.user.id,
    avatar: client.user.displayAvatarURL({ dynamic: true, size: 256 })
  });
});

eApp.get("/api/guilds", (req, res) => {
  let guilds = [...client.guilds.cache.values()].map(guild => {
    return {
      id: guild.id,
      name: guild.name,
      memberCount: guild.memberCount,
      icon: guild.iconURL({ dynamic: true, size: 256 })
    }
  });
  res.send(guilds);
});

eApp.get("/api/guild", async (req, res) => {
  let guild = client.guilds.cache.get(req.query.id);
  if (!guild) return res.send({});
  res.send({
    id: guild.id,
    name: guild.name,
    memberCount: guild.memberCount,
    icon: guild.iconURL({ dynamic: true, size: 256 }),
    channels: Object.fromEntries([...guild.channels.cache.values()].filter(ch => ch.type != "GUILD_CATEGORY").map(ch => {
      return [ch.id, {
        name: ch.name,
        id: ch.id,
        type: ch.type,
        categoryId: ch.parentId,
        position: ch.position,
        canWrite: ch.permissionsFor(guild.me).has("SEND_MESSAGES")
      }]
    })),
    categories: [...guild.channels.cache.values()]
      .filter(ch => ch.type == "GUILD_CATEGORY")
      .sort((a, b)=> a.position - b.position)
      .reduce((all, current) => {
      if (current.type == "GUILD_CATEGORY") all[current.id] = {
        name: current.name,
        position: current.position
      };
      return all;
    }, {})
  });
});


client.on("messageCreate", (message) => {
  message.channel.messages.cache.set(message.id, message);
  wsSend("messageCreate", message);
})

client.on("messageUpdate", (oldMessage, message) => {
  if (message.channel.messages.cache.has(message.id)) {
    message.channel.messages.cache.set(message.id, message);
    wsSend("messageUpdate", message);
  }
})

client.on("messageDelete", (message) => {
  message.channel.messages.cache.delete(message.id);
  wsSend("messageDelete", message.id);
})

client.on("messageDeleteBulk", (messages) => {
  messages.forEach((message) => {
    message.channel.messages.cache.delete(message.id);
    wsSend("messageDelete", message.id);
  })
})

eApp.get("/api/messages", async (req, res) => {
  let guild = client.guilds.cache.get(req.query.gid);
  if (!guild) return res.send([]);
  let channel = guild.channels.cache.get(req.query.cid);
  if (!channel || !channel.isText()) return res.send([]);
  if (channel.messages.cache.size == 0) await channel.messages.fetch({ limit: 50 });
  return res.send(Object.fromEntries([...channel.messages.cache.entries()].sort((a, b)=>a[1].createdAt-b[1].createdAt).map(([id, msg]) => {
    return [id, {
      content: msg.content,
      embeds: msg.embeds.map(i => {
        let ext = stuffs.getFileExtension((i.image || i.video)?.url || i.url || "");
        return ({
          url: i.url,
          type: ["gif", "png", "jpeg", "jfif", "jpg"].includes(ext)
            ? "image"
            : ["webm", "mp4", "mov"].includes(ext)
              ? "video"
              : "rich"
        })
      }),
      createdTimestamp: msg.createdTimestamp,
      authorId: msg.author.id,
      id: msg.id
    }]
  })));
})

eApp.post("/api/send", async (req, res) => {
  let guild = client.guilds.cache.get(req.query.gid);
  if (!guild) return res.send({});
  let channel = guild.channels.cache.get(req.query.cid);
  if (!channel || !channel.isText()) return res.send({});
  let msg = await channel.send(req.body.content);
  return res.send(msg.toJSON());
})

function userToJson(user) {
  return {
    id: user.id,
    username: user.username,
    discriminator: user.discriminator,
    avatar: user.avatarURL({ dynamic: true, size: 256 }),
    bot: user.bot,
    createdAt: user.createdAt
  }
}

client.on("userUpdate", (oldUser, user) => {
  wsSend("userUpdate", userToJson(user));
});

eApp.get("/api/user", async (req, res) => {
  let user = client.users.cache.get(req.query.id);
  if (!user) return res.send({});
  return res.send(userToJson(user));
});

(async () => {
  await client.login(CONFIG.DISCORD_TOKEN);
  console.log(`Logged in to discord! ${client.user.tag}`);
  console.log(`http://127.0.0.1:${CONFIG.PORT}/guild-page?id=${client.guilds.cache.first().id}`)
})();