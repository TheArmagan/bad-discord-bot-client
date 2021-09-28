const url = new URL(window.location.href);
let app;
/** @type {WebSocket} */
let ws; 

async function fetchJson(url) {
  return (await fetch(url)).json();
}

function getAllHashPairs() {
  if (window.location.hash.length <= 1) return [];
  return Object.fromEntries(window.location.hash.slice(1).split("&").map(i => i.split("=", 2).map(i => decodeURIComponent(i))));
}

function setAllHashPairs(entires) {
  window.location.hash = Object.entries(entires).map(i => `${encodeURIComponent(i[0])}=${encodeURIComponent(i[1])}`).join("&")
}

function setHashKey(key, value) {
  let pairs = getAllHashPairs();
  pairs[key] = value;
  setAllHashPairs(pairs);
}

function delHashKey(key) {
  let pairs = getAllHashPairs();
  delete pairs[key];
  setAllHashPairs(pairs);
}

function getHashKey(key) {
  return getAllHashPairs()[key];
}

(async () => {
  const { HTTP: PORT_HTTP, WS: PORT_WS } = await fetchJson(`/api/port`);
  ws = new WebSocket(`ws://127.0.0.1:${PORT_WS}`);
  let guildId = url.searchParams.get("id");
  let guild = await fetchJson(`/api/guild?id=${guildId}`);
  let clientUser = await fetchJson(`/api/client`);
  let guilds = await fetchJson(`/api/guilds`);
  
  document.title = `Armağan's Bot Client | ${guild.name}`

  app = new Vue({
    el: "#app",
    mounted() {
      document.querySelector("#app").classList.add("visible");

      this.setCurrentChannel(guild.channels[getHashKey("cid")]?.id || Object.values(guild.channels).find(i => i.type == "GUILD_TEXT").id);

      ws.addEventListener("message", async (ev) => {
        const [eventName, data] = JSON.parse(ev.data);
        console.log([eventName, data]);
        switch (eventName) {
          case "messageUpdate":
          case "messageCreate": {
            if (this.currentChannel.id == data.channelId) {
              Vue.set(this.channelMessages, data.id, await this.resolveMessage(data))
            }
            break;
          }
          case "messageDelete": {
            if (this.channelMessages[data]) {
              Vue.set(this.channelMessages[data], "deleted", true);
            }
            
            break;
          }
          case "userUpdate": {
            this.users[data.id] = data;
            break;
          }
        }
      });

    },
    data() {
      return {
        guild,
        clientUser,
        guilds,
        currentChannel: {},
        channelMessages: {},
        textBoxContent: "",
        users: {}
      }
    },
    computed: {
      channelMessagesSortedArray() {
        return Object.values(this.channelMessages).sort((a, b) => a.createdTimestamp - b.createdTimestamp)
      },
      canWrite() {
        return this.currentChannel.canWrite;
      }
    },
    watch: {
      channelMessages() {
        this.messagesScrollBottom();
      }
    },
    methods: {
      onTextBoxKeyDown(e) {
        if (e.code == "Enter") {
          let content = this.textBoxContent;
          this.sendMessage(this.guild.id, this.currentChannel.id, content);
          this.clearTextBox();
        }
      },
      messagesScrollBottom() {
        this.$nextTick(() => {
          setTimeout(() => {
            let elm = this.$refs.messagesWrapper;
            elm.children[elm.children.length - 1]?.scrollIntoView();
          }, 0)
        })
      },
      clearTextBox() {
        setTimeout(() => {
          this.$refs.writingAreaContent.innerHTML = "";
          this.textBoxContent = "";
        },0)
      },
      async sendMessage(gid, cid, content) {
        let fetched = await fetch(`/api/send?gid=${gid}&cid=${cid}`, {
          method: "POST",
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content })
        });
        let json = await fetched.json();
        return json;
      },
      setCurrentChannel(id) {
        let ch = this.guild.channels[id];
        this.currentChannel = ch;
        document.title = `Armağan's Bot Client | ${guild.name} > #${ch.name}`;
        setHashKey("cid", id);
        Vue.set(this, "channelMessages", {});
        fetchJson(`/api/messages?gid=${this.guild.id}&cid=${id}`)
          .then(json => {
            Object.entries(json).forEach(async ([id, msg]) => {
              Vue.set(this.channelMessages, id, await this.resolveMessage(msg))
            });
          })
      },
      async getUser(id) {
        if (this.users[id]) return this.users[id];
        let user = await fetchJson(`/api/user?id=${id}`);
        this.users[id] = user;
        return this.users[id];
      },
      async resolveMessage(msg) {
        return {
          ...msg,
          author: await this.getUser(msg.authorId)
        }
      }
    }
  })
})();