const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const mongoose = require("mongoose");

//Connect to MongoDB
mongoose.connect("mongodb://localhost/game", { useNewUrlParser: true });
mongoose.set("strictQuery", false);
//Schema for Game Group
const groupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  players: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Player",
    },
  ],
  maxPlayers: {
    type: Number,
    default: 5,
  },
  gameStarted: {
    type: Boolean,
    default: false,
  },
  gameTimer: {
    type: Number,
    default: 15,
  },
});

//Schema for Player
const playerSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
  },
  score: {
    type: Number,
    default: 0,
  },
});

const Group = mongoose.model("Group", groupSchema);
const Player = mongoose.model("Player", playerSchema);

app.use(express.json());
app.use(express.static("public"));

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

app.get("/groups", (req, res) => {
  Group.find({}).then((groups) => {
    res.json(groups);
  });
});

app.post("/groups", (req, res) => {
  const { name } = req.body;
  const group = new Group({ name });
  group.save().then((newGroup) => {
    res.json(newGroup);
  });
});

app.post("/groups/:id/join", (req, res) => {
  const { id } = req.params;
  const { username } = req.body;
  Group.findById(id).then((group) => {
    if (group.players.length >= group.maxPlayers) {
      return res.status(400).send({ error: "Group is full" });
    }
    const player = new Player({ username });
    player.save().then((newPlayer) => {
      group.players.push(newPlayer);
      group.save().then((updatedGroup) => {
        res.json(updatedGroup);
      });
    });
  });
});

io.on("connection", (socket) => {
  console.log("a user connected");
  socket.on("disconnect", () => {
    console.log("user disconnected");
  });
  socket.on("join group", (groupId) => {
    socket.join(groupId);
    Group.findById(groupId).then((group) => {
      if (group.players.length >= 2 && !group.gameStarted) {
        group.gameStarted = true;
        group.save().then(() => {
          io.to(groupId).emit("start game");
          setTimeout(() => {
            Group.findById(groupId).then((group) => {
              group.gameStarted = false;
              group.save().then(() => {
                Player.find({ _id: { $in: group.players } }).then((players) => {
                  const leaderboard = players.sort((a, b) => b.score - a.score);
                  io.to(groupId).emit("end game", leaderboard);
                });
              });
            });
          }, group.gameTimer * 1000);
        });
      }
    });
  });
  socket.on("update score", (groupId, score) => {
    Player.findOne({ socketId: socket.id }).then((player) => {
      player.score += score;
      player.save().then(() => {
        Player.find({ _id: { $in: group.players } }).then((players) => {
          const leaderboard = players.sort((a, b) => b.score - a.score);
          io.to(groupId).emit("update leaderboard", leaderboard);
        });
      });
    });
  });
});

http.listen(3000, () => {
  console.log("listening on *:3000");
});
