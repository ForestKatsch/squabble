
import {Client, SocketTransport} from '../src/main.js';

import * as fs from 'fs';
import * as path from 'path';

import {createInterface} from 'readline';

const printUsage = () => {
  console.log(`Usage: ${process.argv[0]} host:port token`);
}

const start = async () => {
  
  let options = JSON.parse(fs.readFileSync(path.resolve('demo/config-client.json')));

  let args = process.argv.slice(2);
  
  if(args.length <= 1) {
    printUsage();
    return;
  }

  let serverAddress = args[0];

  if(serverAddress.indexOf(':') > 0) {
    options.host = serverAddress.split(':')[0];
    options.port = serverAddress.split(':')[1];
  } else {
    options.host = serverAddress;
  }

  if(args.length >= 2) {
    options.authentication.token = args[1];
  }

  let transport = new SocketTransport();

  /*
  {
    certificates: [
      fs.readFileSync('server-cert.pem')
    ]
  }
  */

  let client = new Client(options, transport);

  try {
    await client.connect(options.host, options.port);
  } catch(err) {
    console.log('Failed to connect!');
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  //console.log('Type to send messages as ${}');

  const getInput = () => {
    rl.question('', (message) => {
      client.sendCommandMessageSend('#general', message);
      
      getInput();
    });
  }

  getInput();

  client.on('message', (info) => {
    console.log(`${info.user} in ${info.channel}: ${info.message}`);
  });
  
  client.on('end', rl.close.bind(rl));

  let exiting = false;

  // Properly handle Ctrl-C.
  process.on('SIGINT', async () => {
    if(exiting) {
      return;
    }

    exiting = true;
    
    await client.quit();
    process.exit();
  });
}

start();
