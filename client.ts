interface IUser {
  name: string;
  connect_number: number;
  id: string;
  opponent_id: string;
}

//variabe declarations
declare const io: SocketIOStatic;

const socket = io();
let user: IUser;
let username: string;
let connect_number: number;
let id: string;
let opponent: IUser;
let field_arr: number[][] = [];  	//a field has either 0, 1 or 2 (nothing, color 1, color 2)
let colour: string;
let my_turn: boolean;
let turn_count: number = 0;

//inizialization of a user
$(function () {
  const $username = $('#username');
  const $connector_number = $('#connect_number');

  $(window).keydown(function (event) {
    //when the user pressed "enter"...
    if (event.which === 13) {
      //name is checked
      if (!username) {
        username = $username.val().toString().trim();
      }
      //connect_number is checked
      if (!connect_number) {
          connect_number = parseInt($connector_number.val().toString().trim());
          if(connect_number<3 || connect_number >30){
            connect_number=undefined;
            alert("Please type in a value between 3 and 30.");
          }
        }
      //if both parameters are filled out, the waiting area is shown
      if (username && connect_number) {
        let greeting = 'Please wait for an opponent...';
        document.getElementById('waiting_header').innerHTML = greeting;
        $('.user_login').fadeOut();
        $('.waiting_ground').fadeIn();

        //the user is "registered" in the server
        user = { name: username, connect_number: connect_number, id: id, opponent_id: '' };
        socket.emit('login', user);
      }
    }
  });
});

//starts the game (hides the waiting-ground and shows the game-ground)
function initializeGame() {
  let greeting;
  if(user.connect_number>=10){
    greeting = 'Hello, ' + user.name + '.\nYou are playing Connect ' + user.connect_number + ' (better known as a waste of time) against ' + opponent.name;
  }else{
    greeting = 'Hello, ' + user.name + '.\nYou are playing Connect ' + user.connect_number + ' against ' + opponent.name;
  }
  document.getElementById('game_header').innerHTML = greeting;
  $('.waiting_ground').hide();

  paintGameGround();
  $('.game_ground').fadeIn();
}

//paints the general game ground (blue grid with "holes" (white circles))
function paintGameGround() {
  let field = document.getElementById('game_field');
  let table: string = '';

  //standard game-ground-size parameters
  let x = user.connect_number * 1.75;
  let y = user.connect_number * 1.5;

  //white standard circle
  let circle: string =
    `<svg width="100" height="100">
      <circle cx="50" cy="50" r="40" stroke="green" stroke-width="4" fill="white" />
    </svg>`;

  //creates the table (game ground)
  for (let i = 0; i < y; i++) {
    table += `<tr>`;
    field_arr[i] = [];
    for (let j = 0; j < x; j++) {
      field_arr[i][j] = 0;
      table += `<td id="${i}_${j}">${circle}</td>`
    }
    table += `</tr>`;
  }
  //adds eventlisteners to the table rows and columns
  field.innerHTML += table;
  for (let i = 0; i < y; i++) {
    for (let j = 0; j < x; j++) {
      addEventListeners(i, j);
    }
  }
}

function addEventListeners(y: number, x: number) {
  //add touch events for smartphones
  document.getElementById(`${y}_${x}`).addEventListener('touchend', function (e) {
    if (my_turn === true) {
      my_turn=false;  //to prevent double touch (and therefore dropping two discs)
      socket.emit('check_disc_drop', x, field_arr, user, colour);
      e.preventDefault();
    }
  }, false);
  //also add mouse events so that you can play it on the PC
  document.getElementById(`${y}_${x}`).addEventListener('click', function (e) {
    if (my_turn === true) {
      socket.emit('check_disc_drop', x, field_arr, user, colour);
    }
  }, false);
}

//action when an opponent was found for the user
socket.on('opponent_found', function (opp: IUser) {
  opponent = opp;
  user.opponent_id = opponent.id;
  initializeGame();
});

//gets the id from this client after the connection
socket.on('get_id', function (identification: string) {
  id = identification;
});

//simple response to see that the user was successfully added
socket.on('user_add', function (message: any) {
  console.log(`Received: ${message}`);
});

//tells the user that his turn has come
socket.on('your_turn', function () {
  my_turn = true;
  document.getElementById('game_info').innerHTML = '\nYour turn';
});

//tells the user that the other player's turn has come
socket.on('wait', function () {
  my_turn = false;
  document.getElementById('game_info').innerHTML = 'Waiting for ' + opponent.name + '\'s turn...';
});

//sets the colour of the user's discs
socket.on('colour', function (color: string) {
  colour = color;
});

//paints the disc after it has been successfully checked that there is available space
socket.on('disc_drop', function (field_array: number[][], y: number, x: number, color: string) {
  field_arr = field_array;
  document.getElementById(`${y}_${x}`).innerHTML =
    `<svg id="${y}_${x}_svg" width="100" height="100" style="display:none">
      <circle cx="50" cy="50" r="40" stroke="green" stroke-width="4" fill="${color}" />
    </svg>`;
  $(`#${y}_${x}_svg`).fadeIn();
  if(colour===color)
    turn_count++;
});

//tells the user that he has won the game
socket.on('won', function () {
  my_turn = false;
  document.getElementById('game_header').innerHTML='';
  document.getElementById('game_info').innerHTML = 'Congratulations, ' + user.name + ', you have won!';
  document.body.style.backgroundColor = 'green';
});

//tells the user that he has lost the game
socket.on('lost', function () {
  my_turn = false;
  document.getElementById('game_header').innerHTML='';
  document.getElementById('game_info').innerHTML = 'Sorry, ' + user.name + '. You have lost the game.';
  document.body.style.backgroundColor = 'red';
});

//tells the users that they have a draw
socket.on('draw', function () {
  my_turn = false;
  document.getElementById('game_header').innerHTML='';
  document.getElementById('game_info').innerHTML = 'You have played a draw.';
  document.body.style.backgroundColor = 'yellow'; 
});

socket.on('opponent_gone', function () {
  alert('Your opponent has left the game.');
  my_turn = false;
});

socket.on('try_again', function(){
  my_turn=true;
});