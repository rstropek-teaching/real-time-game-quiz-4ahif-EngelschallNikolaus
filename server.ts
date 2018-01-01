import * as express from 'express';
import * as http from 'http';
import * as sio from 'socket.io'
import * as Datastore from 'nedb';

//declaring the variables
let waitingUsers: IUser[] = new Array();
let playingUsers: IUser[] = new Array();
const db = new Datastore({ filename: __dirname + 'highscore.dat', autoload: true });
const app = express();
app.use(express.static(__dirname));
const server = http.createServer(app);
const io = sio(server);

//starting the server which listens on port 3000
server.listen(3000, function () {
  console.log("Listening on Port 3000");
});

//server actions

//action on connection
io.on('connection', function (socket) {
  //sends the id to each client on connect
  io.sockets.connected[socket.id].emit('get_id', socket.id);

  socket.on('disconnect', function () {
    //try to delete user out of waitingUsers
    waitingUsers.forEach(function (user) {
      if (user.id === socket.id) {
        waitingUsers.splice(waitingUsers.indexOf(user), 1);
      }
    });

    let opp_id = '';
    //try to delete user from playingUsers and get opponent id
    playingUsers.forEach(function (user) {
      if (user.id === socket.id) {
        if (user.opponent_id !== '') {
          io.sockets.connected[user.opponent_id].emit('opponent_gone');
          playingUsers.splice(playingUsers.indexOf(user), 1);
          opp_id = user.opponent_id;
        }
      }
    });
    //delete disconnected user's opponent from playingUsers
    playingUsers.forEach(function (user) {
      if (user.id === opp_id) {
        playingUsers.splice(playingUsers.indexOf(user), 1);
      }
    });
  });

  //checks for new highscore and insert if new
  socket.on('score', function (turn_count: number, user: IUser) {
    let dbData = db.getAllData();
    let connect_number_in = false;
    if (dbData === null) {
      db.insert({ username: user.name, connect_number: user.connect_number, turns: turn_count, date: new Date() });
    } else {
      dbData.forEach(function (data) {
        if (data.connect_number === user.connect_number) {
          if (turn_count < data.turns) {
            db.remove(data);
            db.insert({ username: user.name, connect_number: user.connect_number, turns: turn_count, date: new Date() });
            console.log('new highscore');
          }
          connect_number_in=true;
        }
      });
      if (!connect_number_in) {
        db.insert({ username: user.name, connect_number: user.connect_number, turns: turn_count, date: new Date() });
        console.log('new highscore');
      }
    }
  });

  //adds user when a user entered his username and connect_number
  socket.on('login', function (user: IUser) {
    waitingUsers.push(user);
    socket.emit('user_add', `user ${user.name} was added`);
    checkOpponent(user);
  });

  //checks, if the column where the user dropped the disc has any place left
  //tells the clients to insert the discs if there is place
  //changes turns of the players
  socket.on('check_disc_drop', function (x: number, field_arr: number[][], user: IUser, colour: string) {
    let done: boolean;
    for (let y = field_arr.length - 1; y >= 0; y--) {
      if (field_arr[y][x] == 0) {

        //set numbers in the field_arr representing the colours of the game ground
        (colour === 'red') ? field_arr[y][x] = 1 : field_arr[y][x] = 2;

        io.sockets.connected[user.id].emit('disc_drop', field_arr, y, x, colour);
        io.sockets.connected[user.opponent_id].emit('disc_drop', field_arr, y, x, colour);

        io.sockets.connected[user.id].emit('wait');
        io.sockets.connected[user.opponent_id].emit('your_turn');

        //checks game state
        if (checkWin(field_arr, y, x, user)) {
          io.sockets.connected[user.id].emit('won');
          io.sockets.connected[user.opponent_id].emit('lost');
        } else if (checkDraw(field_arr)) {
          io.sockets.connected[user.id].emit('draw');
          io.sockets.connected[user.opponent_id].emit('draw');
        }
        done = true;
        break;
      }
    }
    if (!done)
      io.sockets.connected[user.id].emit('try_again');
  });
});

//checks, if a user has an opponent who wants to play the same game
function checkOpponent(user: IUser) {
  waitingUsers.forEach(function (opponent) {
    if (user !== opponent && user.connect_number === opponent.connect_number) {
      io.sockets.connected[user.id].emit('opponent_found', opponent);
      io.sockets.connected[opponent.id].emit('opponent_found', user);

      //note down the opponents to each other
      opponent.opponent_id = user.id;
      user.opponent_id = opponent.id;

      //random decision over who starts first and their colours
      let random = Math.floor((Math.random() * 2) + 1);
      if (random === 1) {
        io.sockets.connected[user.id].emit('your_turn');
        io.sockets.connected[user.id].emit('colour', 'red');
        io.sockets.connected[opponent.id].emit('wait');
        io.sockets.connected[opponent.id].emit('colour', 'yellow');
      } else {
        io.sockets.connected[opponent.id].emit('your_turn');
        io.sockets.connected[opponent.id].emit('colour', 'red');
        io.sockets.connected[user.id].emit('wait');
        io.sockets.connected[user.id].emit('colour', 'yellow');
      }

      //the two players are now playing...
      playingUsers.push(user);
      playingUsers.push(opponent);

      //...and not waiting anymore
      waitingUsers.splice(waitingUsers.indexOf(user), 1);
      waitingUsers.splice(waitingUsers.indexOf(opponent), 1);
    }
  });
}
//checks, if the last turn finished the game (win or draw)
function checkWin(field_arr: number[][], y: number, x: number, user: IUser) {
  let connect_number = user.connect_number;
  let player_number = field_arr[y][x];
  let row_length = field_arr.length;
  let col_length = field_arr[0].length;
  let count = 0;
  let rowStart = 0;
  let colStart = 0;

  //check for horizontal win
  for (let i = 0; i < col_length; i++) {
    if (field_arr[y][i] === player_number)
      count++;
    else
      count = 0;
    if (count >= connect_number)
      return true;
  }
  //check for vertical win
  count = 0;
  for (let i = 0; i < row_length; i++) {
    if (field_arr[i][x] === player_number)
      count++;
    else
      count = 0;
    if (count >= connect_number)
      return true;
  }
  // top-left to bottom-right 1
  for (let rowStart = 0; rowStart <= row_length - connect_number; rowStart++) {
    count = 0;
    let row, col: number;
    for (row = rowStart, col = 0; row < row_length && col < col_length; row++ , col++) {
      if (field_arr[row][col] == player_number) {
        count++;
        if (count >= connect_number)
          return true;
      }
      else
        count = 0;
    }
  }
  // top-left to bottom-right 2
  for (let colStart = 1; colStart <= col_length - connect_number; colStart++) {
    count = 0;
    let row, col;
    for (row = 0, col = colStart; row < row_length && col < col_length; row++ , col++) {
      if (field_arr[row][col] == player_number) {
        count++;
        if (count >= connect_number)
          return true;
      }
      else
        count = 0;
    }
  }
  // bottom-left to top-right 1
  for (let rowStart = 0; rowStart <= row_length - connect_number; rowStart++) {
    count = 0;
    let row, col;
    for (row = rowStart, col = col_length - 1; row < row_length && col >= 0; row++ , col--) {
      if (field_arr[row][col] == player_number) {
        count++;
        if (count >= connect_number)
          return true;
      }
      else
        count = 0;
    }
  }
  // bottom-left to top-right 2
  for (let colStart = col_length - 2; colStart >= connect_number - 1; colStart--) {
    count = 0;
    let row, col;
    for (row = 0, col = colStart; row < row_length && col >= 0; row++ , col--) {
      if (field_arr[row][col] == player_number) {
        count++;
        if (count >= connect_number)
          return true;
      }
      else
        count = 0;
    }
  }
  return false;
}
//checks if the game is draw
function checkDraw(field_arr: number[][]) {
  for (let i = 0; i < field_arr.length; i++) {
    for (let j = 0; j < field_arr[0].length; j++) {
      if (field_arr[i][j] === 0)
        return false;
    }
  }
  return true;
}
