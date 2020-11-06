
import * as tls from 'tls';
import * as fs from 'fs';

import {COMMAND, COMMAND_UNAUTHENTICATED_MAX_LENGTH, CLIENT_COMMANDS_PERMITTED_WHILE_UNAUTHENTICATED, parametersToArguments} from './commands.js';

import User from './user.js';
import Protocol, {STAGE} from './protocol.js';
import Channel from './channel.js';

// # Server
// The actual server logic itself.
export default class Server {
  
  constructor(options, transports) {
    this.options = {
      appName: 'squabble-lib-server',
      authenticators: {
        anonymous: null,
        token: null
      },
      channels: {
        createOnJoin: true,
      },
      ...options
    };

    this.transports = transports;
    transports.forEach((transport) => transport.setProtocol(this));

    // Key/value listing of all channels.
    this.channels = {};

    // A set of connection objects.
    this.clients = new Set();
  }

  // Returns the channel, or `null` if that channel has an invalid name.
  // Currently, this will "create" channels too.
  getChannel(name) {
    if(!this.isValidChannelName(name)) {
      return null;
    }
    
    if(!(name in this.channels)) {
      let channel = new Channel(name);
      this.initChannel(channel);
      
      this.channels[name] = channel;
    }
    
    return this.channels[name];
  }

  initChannel(channel) {
    channel.on('message', (event) => {
      this.handleChannelMessage(event.channel, event.message);
    });
  }

  handleChannelMessage(channel, message) {
    this.clients.forEach((client) => {
      client.sendCommandMessageReceived(message.time, channel.name, message.user.handle, message.message, message.flags);
    });
  }

  // TODO: validate.
  isValidChannelName(name) {
    return true;
  }

  // Convenience function.
  async start(host, port) {
    for(let transport of this.transports) {
      await transport.startServer(host, port);
    }
  }

  // Kick all clients and end our server.
  async quit() {
    let clients = [...this.clients];

    for(let client of clients) {
      await client.quit();
    }

    // TODO: end transports.
  }

  addClient(client) {
    this.clients.add(client);
  }
  
  // Returns the user object for this user, or `null` if the user is not allowed to join.
  authenticateWithAnonymous(client, handle) {
    if(this.options.authenticators.anonymous) {
      return this.options.authenticators.anonymous(handle);
    }
  }

  // Returns the user object for this user, or `null` if the user is not allowed to join.
  authenticateWithToken(client, token) {
    if(this.options.authenticators.token) {
      return this.options.authenticators.token(token);
    }
  }

  handleMessage(client, channel, message, flags) {
    channel = this.getChannel(channel);

    if(!channel) {
      throw new Error('no-channel');
    }

    channel.message(client.user, message, flags);
  }

}

// Server-owned object about a single client connection.
export class ClientConnection extends Protocol {

  constructor(server, transport) {
    super(server.options)

    this.server = server;

    this.transport = transport;
    
    transport.setProtocol(this);

    this.user = null;

    this.start();
  }

  start() {
    console.log(`New client connected from ${this.transport.getNetworkName()}`);

    this.once('end', () => {
      console.log(`Client disconnected from ${this.transport.getNetworkName()}`);
    });
  }

  getAppName() {
    return this.server.options.appName;
  }

  isAuthenticated() {
    return this.user !== null;
  }

  // Initializes command handlers.
  initStages() {
    super.initStages();
    
    this.initStagesHandshake();
    this.initStagesAuthentication();
    this.initStagesMessage();
  }

  async quit() {
    this.terminateConnection('quitting');
  }

  initStagesHandshake() {
    // Verify that this command is allowed to run given our current authentication state.
    this.stage(STAGE.ACTION, '*', (command) => {
      if(this.isAuthenticated()) {
        return command;
      }

      if(CLIENT_COMMANDS_PERMITTED_WHILE_UNAUTHENTICATED.indexOf(command.code) < 0) {
        this.terminateConnection('bad-command');
      }
    });

    this.stage(STAGE.ACTION, COMMAND.VERSION, (command) => {
      this.sendCommandVersion();
    });
    
    this.stage(STAGE.ACTION, COMMAND.CONNECTION_KEEPALIVE, (command) => {
      this.sendCommandConnectionKeepalive();
    });
  }

  initStagesAuthentication() {

    // Anonymous authentication
    this.stage(STAGE.ACTION, COMMAND.AUTH_WITH_ANONYMOUS, (command) => {
      return {
        ...command,
        args: parametersToArguments(command.parameters, [
          {
            name: 'handle',
            type: 'string'
          }
        ])
      };
    });
    
    this.stage(STAGE.ACTION, COMMAND.AUTH_WITH_ANONYMOUS, async (command) => {
      let handle = command.args.handle;
      
      this.user = this.server.authenticateWithToken(this, handle);

      if(this.user) {
        await this.sendCommandAuthenticationApproved();
      } else {
        await this.terminateConnection('bad-auth');
      }
    });

    // With token.
    this.stage(STAGE.ACTION, COMMAND.AUTH_WITH_TOKEN, (command) => {
      return {
        ...command,
        args: parametersToArguments(command.parameters, [
          {
            name: 'token',
            type: 'string'
          }
        ])
      };
    });
    
    this.stage(STAGE.ACTION, COMMAND.AUTH_WITH_TOKEN, async (command) => {
      let token = command.args.token;

      this.user = this.server.authenticateWithToken(this, token);

      if(this.user) {
        await this.sendCommandAuthenticationApproved();
      } else {
        await this.terminateConnection('bad-auth');
      }
    });
    
  }

  initStagesMessage() {
    this.stage(STAGE.PARSE, COMMAND.MESSAGE_SEND, (command) => {
      return {
        ...command,
        args: parametersToArguments(command.parameters, [
          {
            name: 'channel',
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
    
    this.stage(STAGE.ACTION, COMMAND.MESSAGE_SEND, (command) => {
      this.server.handleMessage(this, command.args.channel, command.args.message, command.args.flags);
    });
  }

  handleCommand(command) {
    if(!this.isAuthenticated() && command.length > COMMAND_UNAUTHENTICATED_MAX_LENGTH) {
      console.warn('Client attempted to send message too long while unauthenticated');
      this.terminateConnection('bad-length');
    }

    return super.handleCommand(command);
  }
  
}

