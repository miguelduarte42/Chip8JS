var Chip8JS = (function() {

	var MEMORY_SIZE = 0xFFF;
	var REFRESH_RATE = 16; //60Hz
	var SCALE = 5;
	var HEIGHT = 32;
	var WIDTH = 64;
	var START_ADDRESS = 0x200;
	var CANVAS_HEIGHT = 32;
	var CANVAS_WIDTH = 64;
	var SPEED = 3;
	
	var memory;					//4k of memory. ROMs loaded from 0x200 to 0xFFF
	var stack;					//Stack with a depth of 16
	var vRam;					//64x32 video memory for the display
	var keyboard;// = new Array(0xF + 1);
	var V;						//Registers (0x0 through 0xF)
	var I = 0;					//Auxiliary pointer to memory
	var PC = 0x200;				//Program counter
	var SP = 0;					//Stack pointer
	var DT = 0;					//Delay timer
	var ST = 0;					//Sound timer
	
	var haltExecution = false;
	var keyPressed = false;
	
	var loopInterval;
	var canvasContext;
	var canvasBuffer;
	
	var roms = ["Select Game","15PUZZLE","BLINKY","BLITZ","BREAKOUT","BRIX","CONNECT4",
		"GUESS","HIDDEN","INVADERS","KALEID","MAZE","MERLIN","MISSILE",
		"PONG","PONG2","PUZZLE","SQUASH","SYZYGY","TANK","TETRIS","TICTAC",
		"UFO","VBRIX","VERS","WALL","WIPEOFF"];
	
	var gameLoop = function() {
		
		//Since the timers are not very precise, we execute multiple
		//CPU cycles when the gameLoop timer hits
		for(var i = 0 ; i < SPEED ; i++) {
			var opcode = (memory[PC++] << 8) | memory[PC++];
			decode(opcode);
			
			if(haltExecution)
				PC-=2;
			
			if(PC > 0xFFF) {
				clearInterval(loopInterval);
				break;
			}
		}	
	}
	
	var updateTimers = function() {
		if(DT > 0) DT--;
		if(ST > 0) ST--;
	}
	
	var updateCanvas = function() {
	
		contextBuffer.fillStyle = "#000";
		contextBuffer.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
	
		contextBuffer.fillStyle = "#fff";
		
		for(var i = 0 ; i < vRam.length ; i++) {
			
			if(vRam[i] == 1) {
				
				var y = i/WIDTH | 0;
				var x = i - y*WIDTH;
				
				contextBuffer.fillRect(x*SCALE,y*SCALE,SCALE,SCALE);
			}
		}
		
		canvasContext.drawImage(canvasBuffer,0,0);
	}
	
	var clear = function() {
		for(var i = 0 ; i < vRam.length ; i++)
			vRam[i] = 0;
	}
	
	var draw = function(x, y, sprite) {
		var erased = false;
			
		var initY = y;
		var initX = x;
	
		for (var i = 0; i < sprite.length; i++) {
			
			for (var px = 7; px >= 0; px--) {
	
				if ((sprite[i] >>> px) & 0x1 == 0x1) {
					
					var indexY = (initY + i) % HEIGHT;
					var indexX = (initX + (7 - px)) % WIDTH;
					
					vRam[indexY*WIDTH + indexX] ^= 1;
					if(vRam[indexY*WIDTH + indexX] == 0)
						erased = true;
				}
			}
		}
		
		return erased;
	}
	
	var loadFile = function(file) {
	
		init();
			
		var fileHandler =  getBinary("roms/"+file);
		
		for(i = 0; i < fileHandler.length; ++i)
			memory[0x200 + i] = fileHandler.charCodeAt(i) & 0xff;
		
		clear();
		
		loopInterval = setInterval(gameLoop,0);
	}
	
	var init = function() {
	
		clearInterval(loopInterval);
	
		DT = 0;
		ST = 0;
		SP = 0;
		I = 0;
		stack = new Array(0xF + 1);
		keyboard = new Array(0xF + 1);
		V = new Array(0xF + 1);
		PC = START_ADDRESS;
		
		haltExecution = false;
		keyPressed = false;
	
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
		
		for(var i = 0 ; i < memory.length ; i++)
			memory[i] = 0;
	
		for(var i = 0 ; i < sprites.length ; i++)
			memory[i] = sprites[i];
			
		for(var i = 0 ; i < keyboard.length ; i++)
			keyboard[i] = 0;
			
		for(var i = 0 ; i < stack.length ; i++)
			stack[i] = 0;
			
		for(var i = 0 ; i < V.length ; i++)
			V[i] = 0;
	}
	
	var getBinary = function(file){
		var xhr = new XMLHttpRequest();  
		xhr.open("GET", file, false);  
		xhr.overrideMimeType("text/plain; charset=x-user-defined");  
		xhr.send(null);
		return xhr.responseText;
	}
	
	/**
	 * Receives an opcode and executes the corresponding instruction.
	 */
	var decode = function(i) {
		
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
			
			if(keyboard[V[x]])
				PC+=2;
				
		} else if ((i & 0xF0FF) == 0xE0A1) { //SKNP Vx (0xExA1)
			/*
			 * Checks the keyboard, and if the key corresponding to the value of Vx is currently in the up position, PC is increased by 2.
			 */
			var x = (i & 0xF00) >>> 8;
			
			if(!keyboard[V[x]])
				PC+=2;
			
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
			
			if(!haltExecution) {
				keyPressed = false;
				haltExecution = true;
			} else if(keyPressed) {
				haltExecution = false;
				for(var j = 0 ; j <= 0xF ; j++) {
					if(keyboard[j] == 1) {
						V[x] = j;
						break;
					}
				}	
			}
			
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
			
			memory[I] =  (V[x] / 100) | 0;
			memory[I+1] = ((V[x] - memory[I]*100) / 10) | 0;
			memory[I+2] = (V[x] - memory[I]*100 - memory[I+1]*10) | 0;
			
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
		}
	}
	
	var initEmulator = function(emulator) {
		CANVAS_WIDTH *=SCALE;
		CANVAS_HEIGHT *=SCALE;
		
		var emulator = document.getElementById(emulator);
		
		var select = document.createElement('select');
		
		for(var i = 0 ; i < roms.length ; i++) {
			var option = document.createElement('option');
			option.text = roms[i];
			select.add(option);
		}
		select.onchange = function(evt) {
			var s = evt.srcElement;
			if(s.selectedIndex > 0)
				loadFile(s[s.selectedIndex].text);
		};
		select.style.float="left";
		emulator.appendChild(select);
		
		var help = document.createElement('div');
		help.innerHTML = "<br/>Keys:<br/><br/>1 2 3 4<br/>Q W E R<br/>A S D F<br/>Z X C V";
		help.style.float="left";
		help.style.clear="left";
		emulator.appendChild(help);
		
		var canvas = document.createElement('canvas');
		emulator.appendChild(canvas);
		
		canvas.width = CANVAS_WIDTH;
		canvas.height = CANVAS_HEIGHT;
		
		canvasContext = canvas.getContext("2d");
		
		canvasBuffer = document.createElement('canvas');
		contextBuffer = canvasBuffer.getContext('2d');
		canvasBuffer.width = CANVAS_WIDTH;
		canvasBuffer.height = CANVAS_HEIGHT;
		
		vRam = new Array(HEIGHT*WIDTH);
		
		setInterval(updateTimers,REFRESH_RATE);
		setInterval(updateCanvas,REFRESH_RATE);
		
		document.onkeyup = document.onkeydown = function(evt) {
			var charCode = evt.which;
			var charStr = String.fromCharCode(charCode);
			
			var value = evt.type == 'keydown' ? 1 : 0;
			
			switch(charStr) {
				case '1': keyboard[0x1] = value; break;
				case '2': keyboard[0x2] = value; break;
				case '3': keyboard[0x3] = value; break;
				case '4': keyboard[0xC] = value; break;
				
				case 'Q': keyboard[0x4] = value; break;
				case 'W': keyboard[0x5] = value; break;
				case 'E': keyboard[0x6] = value; break;
				case 'R': keyboard[0xD] = value; break;
				
				case 'A': keyboard[0x7] = value; break;
				case 'S': keyboard[0x8] = value; break;
				case 'D': keyboard[0x9] = value; break;
				case 'F': keyboard[0xE] = value; break;
				
				case 'Z': keyboard[0xA] = value; break;
				case 'X': keyboard[0x0] = value; break;
				case 'C': keyboard[0xB] = value; break;
				case 'V': keyboard[0xF] = value; break;
				default: keyPressed = false;
			}
			keyPressed = value ? value : keyPressed;
		};
		clear();
	}
	
	return {
		loadFile:loadFile,
		initEmulator:initEmulator
	};
	
})();
