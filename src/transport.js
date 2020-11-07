
import * as tls from 'tls';
import * as fs from 'fs';

import {ClientConnection} from './server.js';

import {EventEmitter} from 'events';

export default class Transport extends EventEmitter {

  constructor() {
    super();
    this.protocol = null;
  }

  setProtocol(protocol) {
    this.protocol = protocol;
  }

  async end() {
    throw new Error('override the Transport.end() method');
  }

  async send(msg) {
    throw new Error('override the Transport.send() method');
  }

  // Returns some kind of semi-unique ID to identify this connection.
  // Typically, this will be the IP address.
  getNetworkId() {
    throw new Error('override the Transport.getNetworkId() method');
  }
  
  getTransportName() {
    throw new Error('override the Transport.getTransportName() method');
  }

  getNetworkName() {
    return `[${this.getTransportName()}: ${this.getNetworkId()}]`;
  }
  
}

export class SocketTransport extends Transport {

  constructor(options) {
    super();

    this.options = {
      ...options
    };

    this.buffer = '';

    this.socket = this.options.socket;

    this.handleSocketData = this.handleSocketData.bind(this);
    this.handleSocketError = this.handleSocketError.bind(this);
    this.handleSocketEnd = this.handleSocketEnd.bind(this);
    this.handleSocketTimeout = this.handleSocketTimeout.bind(this);

    if(this.socket) {
      // Here, the socket is on the server-side only.
      this.initSocketServer();
    }
  }

  getNetworkId() {
    if(this.socket) {
      return `${this.socket.remoteAddress || '???'}:${this.socket.remotePort || '-1'}`;
    } else if(this.server) {
      return this.server.address();
    }

    return null;
  }
  
  getTransportName() {
    return 'tcp-socket';
  }
  
  // This is run on the server, and used to add a client.
  handleClientConnection(socket) {
    let client = new ClientConnection(this.protocol, new SocketTransport({
      socket: socket
    }));

    this.protocol.addClient(client);
  }

  // Start a server.
  async startServer(host, port) {
    return new Promise((resolve, reject) => {
      this.server = tls.createServer({
        key: this.protocol.options.certificate.key,
        cert: this.protocol.options.certificate.cert,

        rejectUnauthorized: true,
      });

      this.server.on('secureConnection', this.handleClientConnection.bind(this));
      
      this.server.once('error', (err) => {
        reject(err);
      });
      
      this.server.listen(port, host, () => {
        resolve();
        console.log(`Server listening for connection requests on socket ${host}:${port}`);
      });
    });
  }

  // Connect to a server.
  async connectToServer(host, port) {
    return new Promise((resolve, reject) => {
      const options = {
        ca: this.protocol.options.certificates
      };

      this.socket = tls.connect(port, host, options, async () => {
        try {
          await this.protocol.handleSocketConnectedToServer();
          resolve();
        } catch(err) {
          reject(err);
        }
      });

      this.initSocketClient();
      this.socket.once('error', reject);
    });
  }

  initSocket() {
    this.socket.setEncoding('utf8');
    
    this.socket.on('data', this.handleSocketData);
    this.socket.on('end', this.handleSocketEnd);
    this.socket.on('close', this.handleSocketEnd);
    this.socket.on('timeout', this.handleSocketTimeout);
  }
  
  initSocketServer() {
    this.initSocket();

    this.socket.on('error', this.handleSocketError);
    this.socket.on('tlsClientError', this.handleSocketError);
  }

  initSocketClient() {
    this.initSocket();
    
    this.socket.on('error', this.handleSocketError);
  }

  // ## Socket handling.
  
  async handleSocketData(data) {
    this.buffer += data;
    
    try {
      let commands = this.buffer.split(/\x00/g);

      if(commands[commands.length-1].endsWith('\x00')) {
        this.buffer = '';
      } else {
        this.buffer = commands.pop();
      }

      for(let command of commands) {
        this.protocol.handleCommand(command);
      }
      
    } catch(err) {
      this.handleSocketError(err);
    }
  }

  async handleSocketError(err) {
    console.trace(err);
    
    try {
      await this.protocol.terminateConnection('internal-error');
    } catch(err) {
      //
    }
  }
  
  async handleSocketEnd() {
    this.protocol.emit('end');
    
    this.socket.destroy();
  }

  async handleSocketTimeout() {
    this.end();
  }

  async end() {
    this.socket.end();
  }

  isConnected() {
    return this.socket.readyState === 'open';
  }

  async send(msg) {
    return new Promise((resolve, reject) => {
      if(this.socket.readyState !== 'open') {
        reject(new Error('socket-closed'));
      } else {
        this.socket.write(msg + '\x00', resolve);
      }
    });
  }
}
