var memory;
var stack = new Array(0xF+1);
var vRam;
var V = new Array(0xF+1);	//Registers
var I = 0;						//Auxiliary pointer to memory
var PC = 0x200;				//Program counter
var SP = 0;					//Stack pointer
var DT = 0;					//Delay timer
var ST = 0;					//Sound timer

var MEMORY_SIZE = 0xFFF;
var REFRESH_RATE = 1000/60; //60Hz
var SCALE = 1;
var HEIGHT = 32;
var WIDTH = 64;

var CANVAS_HEIGHT = 32;
var CANVAS_WIDTH = 64;

var loopTimeout;

var canvasContext;

// Cross browser, backward compatible solution for requestAnimatonFrame
// Original from: https://gist.github.com/1114293#file_anim_loop_x.js
(function(window, Date) {
    // feature testing
    var raf = window.mozRequestAnimationFrame    ||
              window.webkitRequestAnimationFrame ||
              window.msRequestAnimationFrame     ||
              window.oRequestAnimationFrame      ||
              function(loop, element) {
                  // fallback to setTimeout
                  window.setTimeout(loop, 1000 / 60);
              };

    window.animLoop = function(render, element) {
        var running, lastFrame = +new Date;
        function loop(now) {
            if (running !== false) {
                raf(loop, element);

                // Make sure to use a valid time, since:
                // - Chrome 10 doesn't return it at all
                // - setTimeout returns the actual timeout
                now = now && now > 1E4 ? now : +new Date;
                var deltaT = now - lastFrame;
                // do not render frame when deltaT is too high
                if (deltaT < 160) {
                    running = render( deltaT, now );
                }
                lastFrame = now;
            }
        }
        loop();
    };
})(window, Date);

window.onload = function(){
	initEmulator("canvas", 5);
}

function initEmulator(canvas, scale) {
	SCALE = scale;
	CANVAS_WIDTH *=SCALE;
	CANVAS_HEIGHT *=SCALE;
	element = document.getElementById(canvas);
	element.width = CANVAS_WIDTH;
	element.height = CANVAS_HEIGHT;
    canvasContext = element.getContext("2d");
	vRam = new Array(HEIGHT*WIDTH);
	setInterval("updateCanvas()",REFRESH_RATE);
	setInterval("updateTimers()",REFRESH_RATE);
	clear();
}

function updateTimers() {
	if(DT > 0) DT--;
	if(ST > 0) ST--;
}

function updateCanvas() {
	
	for(var i = 0 ; i < HEIGHT*WIDTH ; i++) {
		
		if(vRam[i] == 0)
			canvasContext.fillStyle = "#000";
		else
			canvasContext.fillStyle = "#fff";
			
		var y = Math.floor(i/WIDTH);
		var x = i - y*WIDTH;
		
		canvasContext.fillRect(x*SCALE,y*SCALE,SCALE,SCALE);
	}
}

function clear() {
	for(var i = 0 ; i < HEIGHT*WIDTH ; i++)
		vRam[i] = 0;
}

function draw(x, y, sprite) {
	var erased = false;
		
	var initY = y;
	var initX = x;

	for (var i = 0; i < sprite.length; i++) {
		
		var line = sprite[i].toString(2);
		
		while(line.length < 8)
			line = '0'+line;
		
		for (var px = 0; px < line.length; px++) {
			if (line[px] == 1) {
				
				var indexY = (initY + i) % HEIGHT;
				var indexX = (initX + px) % WIDTH;
				
				vRam[indexY*WIDTH + indexX] ^= 1;
				if(vRam[indexY*WIDTH + indexX] == 0)
					erased = true;
			}
		}
	}
	
	return erased;
}

function loop() {
	
	clearTimeout(loopTimeout);

	var opcode = (memory[PC++] << 8) | memory[PC++];
	decode(opcode);
	
	if(PC < 0xFFF)
		loopTimeout = setTimeout("loop()",1);
	else
		console.log("damn");
}

function loadFile(file) {

	initMemory();
	
	var file = new BinFileReader("roms/"+file);
	var length = file.getFileSize();
	
	for(i = 0; i < length; ++i)
		memory[0x200 + i] = file.readNumber(1, i);
	
	/*var binary = getBinary("roms/"+file);
	
	for (var i = 0; i < binary.length; i++ ) {
		memory[0x200 + i] = binary.charCodeAt(i);
		if(binary.charCodeAt(i) > 0xFF)
			console.log(binary.charCodeAt(i).toString(2));
	}*/
		
	clear();
	
	loopTimeout = setTimeout("loop()",10);
}

/**
 * Receives an opcode and executes the corresponding instruction.
 */
function decode(i) {
	
	if(i == 0x00E0) { // CLS (0x00E0)
		/*
		 * Clear the display.
		 */
		clear();
		
	} else if(i == 0x00EE) { // RET (0x00EE)
		/*
		 * The interpreter sets the program counter to the address at the top of the stack,then
		 * subtracts 1from the stack pointer.
		 */
		PC = stack[SP--];
		
	}else if ((i & 0xF000) == 0x1000) { // JMP (0x1nnn)
		/*
		 * The interpreter sets the program counter to nnn.
		 */
		var nnn = i & 0xFFF;
		PC = nnn;
		
	} else if ((i & 0xF000) == 0x2000) { // CALL (0x2nnn)
		/*
		 * The interpreter increments the stack pointer, then puts the current PC
		 * on the top of the stack. The PC is then set to nnn.
		 */
		var nnn = i & 0xFFF;
		stack[++SP] = PC;
		PC = nnn;
	
	} else if ((i & 0xF000) == 0x3000) { //SE Vx, kk (0x3xkk)
		/*
		 * The interpreter compares register Vx to kk, and if they are equal, increments the program counter by 2.
		 */
		var x = (i & 0xF00) >>> 8;
		var kk = (i & 0xFF);
		
		if(V[x] == kk)
			PC+=2;
		
	} else if ((i & 0xF000) == 0x4000) { //SNE Vx, kk (0x4xkk)
		/*
		 * The interpreter compares register Vx to kk, and if they are not equal, increments the program counter by 2.
		 */
		var x = (i & 0xF00) >>> 8;
		var kk = (i & 0xFF);
		
		if(V[x] != kk)
			PC+=2;
		
	} else if ((i & 0xF00F) == 0x5000) { //SNE Vx, Vy (0x5xy0)
		/*
		 * The interpreter compares register Vx to register Vy, and if they are equal, increments the program counter by 2.
		 */
		var x = (i & 0xF00) >>> 8;
		var y = (i & 0xF0) >>> 4;
			
		if(V[x] == V[y])
			PC+=2;
		
	} else if ((i & 0xF000) == 0x6000) { //LD Vx, kk (0x6xkk)
		/*
		 * The interpreter puts the value kk into register Vx
		 */
		var x = (i & 0xF00) >>> 8;
		var kk = i & 0xFF;
		V[x] = kk;
		
	} else if ((i & 0xF000) == 0x7000) { //ADD Vx, kk (0x7xkk)
		/*
		 * Adds the value kk to the value of register Vx, then stores the result in Vx.
		 */
		var x = (i & 0xF00) >>> 8;
		var kk = i & 0x0FF;
		
		V[x] = (V[x] + kk) & 0xFF;

	} else if ((i & 0xF00F) == 0x8000) { //LD Vx, Vy (0x8xy0)
		/*
		 * Stores the value of register Vy in register Vx.
		 */
		var x = (i & 0xF00) >>> 8;
		var y = (i & 0xF0) >>> 4;
		
		V[x] = V[y];
		
	} else if ((i & 0xF00F) == 0x8001) { //OR Vx, Vy (0x8xy1)
		/*
		 * Performs a bitwise OR on the values of Vx and Vy, then stores the result in Vx.
		 * A bitwise OR compares the corrseponding bits from two values, and if either bit is 1,
		 * then the same bit in the result is also 1. Otherwise, it is 0.
		 */
		var x = (i & 0xF00) >>> 8;
		var y = (i & 0xF0) >>> 4;
		V[x] = V[x] | V[y];
		
	} else if ((i & 0xF00F) == 0x8002) { //AND Vx, Vy (0x8xy2)
		/*
		 * Performs a bitwise AND on the values of Vx and Vy, then stores the result in Vx.
		 * A bitwise AND compares the corresponding bits from two values, and if both bits are 1,
		 * then the same bit in the result is also 1. Otherwise, it is 0
		 */	
		var x = (i & 0xF00) >>> 8;
		var y = (i & 0x0F0) >>> 4;
		V[x] = V[x] & V[y];
			
	} else if ((i & 0xF00F) == 0x8003) { //XOR Vx, Vy (0x8xy3)
		/*
		 * Performs a bitwise exclusive OR on the values of Vx and Vy, then stores the result in Vx.
		 * An exclusive OR compares the corresponding bits from two values, and if the bits are not both the same,
		 * then the corresponding bit in the result is set to 1. Otherwise, it is 0.
		 */
		var x = (i & 0xF00) >>> 8;
		var y = (i & 0xF0) >>> 4;
		V[x] = V[x] ^ V[y];

	} else if ((i & 0xF00F) == 0x8004) { //ADD Vx, Vy Carry (0x8xy4)
		/*
		 * The values of Vx and Vy are added together.
		 * If the result is greater than 8 bits (i.e., > 255,) VF is set to 1, otherwise 0.
		 * Only the lowest 8 bits of the result are kept, and stored in Vx. 
		 */
		var x = (i & 0xF00) >>> 8;
		var y = (i & 0xF0) >>> 4;
		
		var sum = V[x] + V[y];
		
		if(sum > 0xFF)
			V[0xF] = 1;
		else
			V[0xF] = 0;
		
		V[x] = sum & 0xFF;
			
	} else if ((i & 0xF00F) == 0x8005) { //SUB Vx, Vy (0x8xy5)
		/*
		 * If Vx > Vy, then VF is set to 1, otherwise 0. Then Vy is subtracted from Vx, and the results stored in Vx.
		 */
		var x = (i & 0xF00) >>> 8;
		var y = (i & 0xF0) >>> 4;
		
		if(V[x] > V[y])
			V[0xF] = 1;
		else
			V[0xF] = 0;
		
		var sub = (V[x] - V[y]) & 0xFF;
		
		V[x] = sub;

	} else if ((i & 0xF00F) == 0x8006) { //SHR Vx {, Vy} (0x8xy6)
		/*
		 * If the least-significant bit of Vx is 1, then VF is set to 1, otherwise 0. Then Vx is divided by 2.	
		 */
		var x = (i & 0xF00) >>> 8;
			
		var lsb = V[x] & 0x1;
		
		if(lsb == 1)
			V[0xF] = 1;
		else
			V[0xF] = 0;
		
		V[x]= V[x] >>> 1;

	} else if ((i & 0xF00F) == 0x8007) { //SUBN Vx, Vy (0x8xy7)
		/*
		 * If Vy > Vx, then VF is set to 1, otherwise 0. Then Vx is subtracted from Vy, and the results stored in Vx.
		 */
		var x = (i & 0xF00) >>> 8;
		var y = (i & 0xF0) >>> 4;
		
		if(V[y] > V[x])
			V[0xF] = 1;
		else
			V[0xF] = 0;
		
		var sub = (V[y] - V[x]);
		
		V[x] = (sub & 0xFF);
		
	} else if ((i & 0xF00F) == 0x800E) { //SHL Vx {, Vy}
		/*
		 * If the most-significant bit of Vx is 1, then VF is set to 1, otherwise to 0. Then Vx is multiplied by 2.
		 */
		var x = (i & 0xF00) >>> 8;
		
		var lsb = V[x] >>> 7;
		
		if(lsb == 0x1)
			V[0xF] = 1;
		else
			V[0xF] = 0;
		
		V[x] = (V[x] << 1) & 0xFF;
		
	} else if ((i & 0xF00F) == 0x9000) { //SNE Vx, Vy (0x9xy0)
		/*
		 * The values of Vx and Vy are compared, and if they are not equal, the program counter is increased by 2.
		 */	
		var x = (i & 0xF00) >>> 8;
		var y = ((i & 0xF0) >>> 4);
		
		if(V[x] != V[y])
			PC+=2;

	} else if ((i & 0xF000) == 0xA000) { //LD I, addr (0xAnnn)
		/*
		 * The value of register I is set to nn
		 */
		I = i & 0xFFF;

	} else if ((i & 0xF000) == 0xB000) { //JP V0, addr (0xBnnn)
		/*
		 * The program counter is set to nnn plus the value of V0.	
		 */
		PC = (i & 0xFFF)+V[0];
			
	} else if ((i & 0xF000) == 0xC000) { //RND Vx, byte (0xCxkk)
		/*
		 * The interpreter generates a random number from 0 to 255, which is then ANDed with the value kk.
		 * The results are stored in Vx. See instruction 8xy2 for more information on AND.
		 */
		var x = (i & 0xF00) >>> 8;
		var kk = i & 0x0FF;
		
		V[x] = (Math.random()*256) & kk;
		
	} else if ((i & 0xF000) == 0xD000) { //DRW Vx, Vy, nibble (0xDxyn)
		/*
		 * The interpreter reads n bytes from memory, starting at the address stored in I. These bytes are
		 * then displayed as sprites on screen at coordinates (Vx, Vy). Sprites are XORed onto the existing screen.
		 * If this causes any pixels to be erased, VF is set to 1, otherwise it is set to 0. If the sprite is
		 * positioned so part of it is outside the coordinates of the display, it wraps around to the opposite
		 * side of the screen. See instruction 8xy3 for more information on XOR, and section 2.4, Display, for
		 * more information on the Chip-8 screen and sprites.
		 */
		var x = (i & 0xF00) >>> 8;
		var y = (i & 0xF0) >>> 4;
		var n = i & 0xF;
		
		var sprite = new Array();
		var count = 0;
		
		for (var j = I; j < I + n; j++)
			sprite[count++] = memory[j];
		
		var erased = draw(V[x], V[y], sprite);
		
		V[0xF] = erased ? 1 : 0;
			
	} else if ((i & 0xF0FF) == 0xE09E) { //SKP Vx (0xEx9E)
		/*
		 * Checks the keyboard, and if the key corresponding to the value of Vx is currently in the down position, PC is increased by 2.
		 */
		var x = (i & 0xF00) >>> 8;
		
		//TODO
		//if(emulator.getInput().isPressed(V[x]))
		//	PC+=2;
			
	} else if ((i & 0xF0FF) == 0xE0A1) { //SKNP Vx (0xExA1)
		/*
		 * Checks the keyboard, and if the key corresponding to the value of Vx is currently in the up position, PC is increased by 2.
		 */
		var x = (i & 0xF00) >>> 8;
		
		//TODO
		//if(!emulator.getInput().isPressed(V[x]))
		//	PC+=2;
		
	} else if ((i & 0xF0FF) == 0xF007) { //LD Vx, DT (0xFx07)	
		/*
		 * The value of DT is placed into Vx.
		 */
		var x = (i & 0xF00) >>> 8;
		
		V[x] = DT & 0xFF;

	} else if ((i & 0xF0FF) == 0xF00A) { //LD Vx, K (0xFx0A)
		/*
		 * All execution stops until a key is pressed, then the value of that key is stored in Vx.
		 */
		var x = (i & 0xF00) >>> 8;
		
		//TODO
		/*
		emulator.getInput().keyPressed = false;
		while(!emulator.getInput().keyPressed);
		
		for(int j = 0 ; j <= 0xF ; j++) {
			if(emulator.getInput().keys[j] == 1) {
				V[x] = j;
				break;
			}
		}
		*/
	} else if ((i & 0xF0FF) == 0xF015) { //LD DT, Vx (0xFx15)
		/*
		 * DT is set equal to the value of Vx.
		 */
		var x = (i & 0xF00) >>> 8;
		DT = V[x];

	} else if ((i & 0xF0FF) == 0xF018) { //LD ST, Vx (0xFx18)
		/*
		 * ST is set equal to the value of Vx.
		 */
		var x = (i & 0xF00) >>> 8;
		ST = V[x];
		
	} else if ((i & 0xF0FF) == 0xF01E) { //ADD I, Vx (0xFx1E)
		/*
		 * The values of I and Vx are added, and the results are stored in I.
		 */
		var x = (i & 0xF00) >>> 8;
		I = (I+V[x]) & 0xFFF;

	} else if ((i & 0xF0FF) == 0xF029) { //LD F, Vx (0xFx29)
		/*
		 * The value of I is set to the location for the hexadecimal sprite corresponding to the value of Vx.
		 * See section 2.4, Display, for more information on the Chip-8 hexadecimal font.
		 */	    
		var x = (i & 0xF00) >>> 8;
		I = V[x]*5;
			
	} else if ((i & 0xF0FF) == 0xF033) { //LD B, Vx (0xFx33)
		/*
		 * The interpreter takes the decimal value of Vx, and places the hundreds digit in memory at location in I,
		 * the tens digit at location I+1, and the ones digit at location I+2.
		 */
		var x = (i & 0xF00) >>> 8;
		
		memory[I] =  (V[x] / 100);
		memory[I+1] = ((V[x] - memory[I]) / 10);
		memory[I+2] = (V[x] - memory[I] - memory[I+1]);
		
	} else if ((i & 0xF0FF) == 0xF055) { //LD [I], Vx (0xFx55)
		/*
		 * The interpreter copies the values of registers V0 through Vx into memory, starting at the address in I.
		 */
		var x = (i & 0xF00) >>> 8;
		for(var j = 0 ; j <= x ; j++)
			memory[I+j] = V[j];

	} else if ((i & 0xF0FF) == 0xF065) { //LD Vx, [I] (0xFx65)
		/*
		 * The interpreter reads values from memory starting at location I into registers V0 through Vx.
		 */
		var x = (i & 0xF00) >>> 8;
		
		for(var j = 0 ; j <= x ; j++)
			V[j] = memory[I+j];
	}else
		console.log("shit "+i.toString(8));
}

function initMemory() {
	memory = new Array(MEMORY_SIZE);
	
	//Sprites from 0 to F
	var sprites = [
			0xF0,0x90,0x90,0x90,0xF0, //0
			0x20,0x60,0x20,0x20,0x70, //1
			0xF0,0x10,0xF0,0x80,0xF0, //2
			0xF0,0x10,0xF0,0x10,0xF0, //3
			0x90,0x90,0xF0,0x10,0x10, //4
			0xF0,0x80,0xF0,0x10,0xF0, //5
			0xF0,0x80,0xF0,0x90,0xF0, //6
			0xF0,0x10,0x20,0x40,0x50, //7
			0xF0,0x90,0xF0,0x90,0xF0, //8
			0xF0,0x90,0xF0,0x10,0xF0, //9
			0xF0,0x90,0xF0,0x90,0x90, //A
			0xE0,0x90,0xE0,0x90,0xE0, //B
			0xF0,0x80,0x80,0x80,0xF0, //C
			0xE0,0x90,0x90,0x90,0xE0, //D
			0xF0,0x80,0xF0,0x80,0xF0, //E
			0xF0,0x80,0xF0,0x80,0x80  //F
	];

	for(var i = 0 ; i < sprites.length ; i++)
		memory[i] = sprites[i];
}

function getBinary(file){
	var xhr = new XMLHttpRequest();  
	xhr.open("GET", file, false);  
	xhr.overrideMimeType("text/plain; charset=x-user-defined");  
	xhr.send(null);
	return xhr.responseText;
}
