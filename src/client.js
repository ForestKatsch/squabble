
import * as tls from 'tls';
import * as fs from 'fs';

import Protocol, {STAGE} from './protocol.js';
import {SocketTransport} from './transport.js';

import {COMMAND} from './commands.js';

export default class Client extends Protocol {

  constructor(options, transport) {
    super(options);

    this.options = {
      appName: 'squabble-client',
      authentication: {
        type: 'anonymous',
        handle: 'squabble-user'
      },
      keepaliveInterval: 60 * 10,
      ...options
    };

    this.transport = transport;
    transport.setProtocol(this);
    
    this.authenticated = false;

    this.keepaliveTimeout = null;

    this.once('end', () => {
      clearTimeout(this.keepaliveTimeout);
    });
  }

  isConnected() {
    return this.transport.isConnected();
  }

  getAppName() {
    return this.options.appName;
  }

  isAuthenticated() {
    return this.authenticated;
  }

  initStages() {
    super.initStages();
    
    this.initStagesHandshake();
    this.initStagesAuthentication();
    this.initStagesMessage();
  }

  initStagesHandshake() {

    this.stage(STAGE.ACTION, COMMAND.VERSION, (command) => {
      if(!this.isAuthenticated()) {
        this.authenticate();
      }
    });
  }

  initStagesAuthentication() {
    
    this.stage(STAGE.ACTION, COMMAND.AUTH_APPROVED, () => {
      this.authenticated = true;
    });
    
  }

  initStagesMessage() {
    
    this.stage(STAGE.ACTION, COMMAND.MESSAGE_RECEIVED, (command) => {
      this.emit('message', command.args);
    });
    
  }

  async quit() {
    await this.terminateConnection('quitting');
  }

  async authenticate() {
    switch(this.options.authentication.type) {
    case 'token':
      return await this.sendCommandAuthenticateToken(this.options.authentication.token);
    case 'anonymous':
      return await this.sendCommandAuthenticateAnonymous(this.options.authentication.handle);
    default:
      throw new Error('no authentication method');
    }
  }

  // Keepalive handling. This isn't necessary for TCP, but it's useful to automatically time-out disconnected clients.
  sendClientKeepalive() {
    clearTimeout(this.keepaliveTimeout)
    
    this.keepaliveTimeout = setTimeout(() => {
      this.sendCommandConnectionKeepalive();
      this.sendClientKeepalive();
    }, this.options.keepaliveInterval * 1000);
  }

  async send(msg) {
    this.sendClientKeepalive();

    return await super.send(msg);
  }

  async connect(host, port) {
    return await this.transport.connectToServer(host, port);
  }

}
