
import EventEmitter from 'events';
import {COMMAND, parseCommand, createCommand, parametersToArguments} from './commands.js';

export const STAGE = {
  PARSE: 0,
  LOG: 1,
  ACTION: 2
};

export default class Protocol extends EventEmitter {

  constructor(options) {
    super();

    this.options = {
      debug: false,
      ...options
    };
    
    this.protocolVersion = 1;

    // Each stage performs some task.
    this.stages = {};

    this.initStages();
  }

  getAppName() {
    return 'squabble-lib';
  }

  initStages() {
    // Initialize handlers
    this.stage(STAGE.PARSE, COMMAND.CONNECTION_TERMINATE, (command) => {
      return {
        ...command,
        args: parametersToArguments(command.parameters, [
          {
            name: 'reason',
            type: 'string',
          }
        ])
      };
    });
    
    this.stage(STAGE.PARSE, COMMAND.VERSION, (command) => {
      return {
        ...command,
        args: parametersToArguments(command.parameters, [
          {
            name: 'appName',
            value: ''
          },
          {
            name: 'protocolVersion',
            value: 0
          }
        ])
      };
    });
    
    this.stage(STAGE.ACTION, COMMAND.CONNECTION_TERMINATE, (command) => {
      console.log(`Remote terminated connection with reason '${command.args.reason}'`);
      this.transport.end();
    });
    
    this.stage(STAGE.PARSE, COMMAND.AUTH_APPROVED, (command) => {
      return {
        ...command,
        args: parametersToArguments(command.parameters, [
          {
            name: 'reason',
            type: 'string'
          }
        ])
      };
    });
    
    this.stage(STAGE.PARSE, COMMAND.MESSAGE_RECEIVED, (command) => {
      return {
        ...command,
        args: parametersToArguments(command.parameters, [
          {
            name: 'time',
            type: 'number'
          },
          {
            name: 'channel',
            type: 'string'
          },
          {
            name: 'user',
            type: 'string'
          },
          {
            name: 'message',
            type: 'string'
          },
          {
            name: 'flags',
            type: 'string'
          }
        ])
      };
    });
  }
  
  parseCommand(command) {
    return parseCommand(command);
  }

  createCommand(code, parameters) {
    return createCommand(code, parameters);
  }
  
  async sendCommand(code, parameters) {
    let command = this.createCommand(code, parameters);

    if(this.options.debug) {
      console.debug(`send '${command}'`);
    }

    return await this.send(command);
  }

  async send(msg) {
    return await this.transport.send(msg);
  }
  
  // ## Generic handlers.

  // Adds a new command handler.
  // Command handlers are called in order, from first-added to last-added.
  // Each command handler gets the returned value from the previous command handler.
  // If a command handler returns `false`, the event stops and no future handlers are called.
  stage(stage, code, fn, data) {
    
    if(!(stage in this.stages)){
      this.stages[stage] = {};
    }
    
    if(!(code in this.stages[stage])) {
      this.stages[stage][code] = [];
    }
    
    this.stages[stage][code].push({
      callback: fn,
      data: data
    });
  }

  async runStage(stage, code, command) {

    if(command === false) {
      return false;
    }

    if(!(stage in this.stages)) {
      return command;
    }

    if(!(code in this.stages[stage])) {
      return command;
    }

    for(let handler of this.stages[stage][code]) {
      let result = await handler.callback(command, handler.data);

      if(result === false) {
        return false;
      } else if(result === null || result === undefined) {
        continue;
      }

      command = result;
    }

    return command;
  }

  async runStages(code, command) {
    let result = await this.runStage(STAGE.PARSE, code, command);
    result = await this.runStage(STAGE.LOG, code, result);
    result = await this.runStage(STAGE.ACTION, code, result);

    return result;
  }

  async receive() {
    return new Promise((resolve, reject) => {
      this.on('end', reject);
      this.once('recv-process', resolve);
    });
  }

  async processCommand(command) {
    let result = await this.runStages('*', command);
    return await this.runStages(command.code, result);
  }

  async handleCommand(command) {
    if(this.options.debug) {
      console.debug(`recv '${command}'`);
    }
    
    try {
      command = this.parseCommand(command);

      this.emit('recv', command);

      let result = await this.processCommand(command);

      if(result) {
        this.emit('recv-process', result);
      }
    } catch(err) {
      console.error(err);
      await this.terminateConnection('internal-error');
    }
  }

  // Commands

  async sendCommandVersion() {
    return await this.sendCommand(COMMAND.VERSION, [this.getAppName(), this.protocolVersion]);
  }

  async sendCommandConnectionKeepalive() {
    return await this.sendCommand(COMMAND.CONNECTION_KEEPALIVE);
  }

  async sendCommandAuthenticateAnonymous(handle) {
    return await this.sendCommand(COMMAND.AUTH_WITH_ANONYMOUS, handle);
  }

  async sendCommandAuthenticateToken(token) {
    return await this.sendCommand(COMMAND.AUTH_WITH_TOKEN, token);
  }
  
  async sendCommandAuthenticationApproved() {
    return await this.sendCommand(COMMAND.AUTH_APPROVED);
  }
  
  async terminateConnection(reason) {
    await this.sendCommand(COMMAND.CONNECTION_TERMINATE, reason);
    
    this.transport.end();
  }

  async sendCommandMessageSend(channel, message, flags) {
    await this.sendCommand(COMMAND.MESSAGE_SEND, [channel, message, flags || '']);
  }
  
  async sendCommandMessageReceived(time, channel, user, message, flags) {
    await this.sendCommand(COMMAND.MESSAGE_RECEIVED, [time, channel, user, message, flags || '']);
  }
  
  // Returns when the handshake is complete.
  async handleSocketConnectedToServer() {
    await this.sendCommandVersion();
    
    let versionReply = await this.receive();

    let authenticationReply = await this.receive();

    if(authenticationReply.code !== COMMAND.AUTH_APPROVED) {
      throw new Error(authenticationReply.args.reason);
    }

    console.debug(`Connected to ${this.transport.getNetworkName()}`);
  }

}
