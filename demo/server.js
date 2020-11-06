
import {Server, User, SocketTransport} from '../src/main.js';

import * as fs from 'fs';
import * as path from 'path';

const start = async () => {

  let users = JSON.parse(fs.readFileSync(path.resolve('demo/users.json')));
  let options = JSON.parse(fs.readFileSync(path.resolve('demo/config-server.json')));

  options = {
    certificate: {
      key: '',
      cert: ''
    },
    ...options
  };

  options.certificate.key = fs.readFileSync(path.resolve(options.certificate.key));
  options.certificate.cert = fs.readFileSync(path.resolve(options.certificate.cert));

  options.authenticators = {
    anonymous: (nickname) => null,
    token: (token) => (token in users ? new User(users[token]) : null)
  };
  
  let server = new Server(options, [
    new SocketTransport()
  ]);

  await server.start('localhost', 21759);
}

start();
