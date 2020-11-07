
export const COMMAND_CODE_LENGTH_MAX = 32;
export const COMMAND_UNAUTHENTICATED_MAX_LENGTH = 512;

export const COMMAND = {
  // Bidirectional command.
  // When sent from the client, the client is requesting the server protocol version;
  // when sent from the server, it means the server is ok with the client protocol version.
  // If the server is not able to understand the client version, the connection will be terminated immediately by the server
  // with the parameter being the version of the server.
  // Parameters: <name> <protocol_version>
  VERSION: 'V01',

  // A ping command. The client is expected to send this no more than 10 minutes (600 seconds.) after the last command was sent.
  // This command does not need to be sent if the client has sent other commands recently.
  // The server will respond with the same command.
  CONNECTION_KEEPALIVE: 'X00',

  // Sent from the server to the client when a connection is denied and the socket will be closed.
  // Parameters: <reason?>
  CONNECTION_TERMINATE: 'X01',

  // Bidirectional command.
  // Sent when the previous command was not parsed properly.
  // Parameters: <command> <reason?>
  BAD_COMMAND: 'X10',

  // Sent from server to client after a valid authentication method.
  AUTH_APPROVED: 'A00',

  // Sent from client to server to request anonymous authentication.
  // Parameters: <handle?>
  // Even if `handle` is present, the server may choose to select a random handle.
  AUTH_WITH_ANONYMOUS: 'A10',
  // Sent from client to server to request authentication with a pre-generated token.
  // Parameters: <token>
  AUTH_WITH_TOKEN: 'A11',

  // Bidirectional.
  // Request information about a channel.
  // Client parameters: <channel>
  // Server parameters: <channel> <topic> <flags?>
  // If the channel is not accessible to the client, the 'access' flag will be negative.
  // For privacy reasons, servers are encouraged to provide no information in the topic about why the channel is inaccesible, and to send the same response if a channel
  // does not exist.
  // The server may send this command at any time, and for any channel, even if the client is not listening.
  // Servers should ensure they do not leak information about hidden channels with this functionality.
  CHANNEL_INFO: 'C01',

  // Sent from client to server to request joining the channel[s].
  // Parameters: <channel01> <channel02> ...
  CHANNEL_JOIN: 'C10',

  // Same as above.
  CHANNEL_LEAVE: 'C11',

  // Sent from client to server to request a message be sent.
  // Parameters: <channel> <message> <flags?>
  MESSAGE_SEND: 'M00',

  // Sent from server to client to indicate a new message has been received.
  // Parameters: <time> <channel> <user> <message> <flags>
  MESSAGE_RECEIVED: 'M01',

  // Sent from the client to the server to enable receiving messages from the given channel.
  // Any invalid channels will be silently ignored by the server, and the client simply will not receive messages from them.
  // If the channel becomes valid at some point afterwards, the server must begin sending events from those channels as well.
  // The server will reply with the same command, including a list of every channel that the client is now receiving events for.
  // Parameters: <channel01> <channel02> ...
  MESSAGE_LISTEN_START: 'M10',

  // Same as above.
  MESSAGE_LISTEN_STOP: 'M11',

  // Sent from client to server to request a replay of recent messages.
  // It is possible that the server does not contain a log of messages old enough; if so, the first reply will be `MESSAGE_REPLAY_START`.
  // Parameters: <time> <channel?>
  MESSAGE_REQUEST_REPLAY: 'M50',

  // Sent from the server to the client to indicate the oldest replayed message.
  // Not always sent; see above.
  // Parameters: <time> <channel>
  MESSAGE_REPLAY_START: 'M51',

  // Bidirectional.
  // The client sends this command first with a list of extensions it supports,
  // and the reply from the server contains a list of extensions the server supports.
  // Parameters: <extension01:version> <extension02:version> ...
  EXTENSIONS_AVAILABLE: 'E00',

  // Sent from the client to the server.
  // Used to enable extensions.
  // If the server is unable to enable any of the extensions, the result is undefined, and the server will reply with `CONNECTION_BAD_COMMAND`.
  // Parameters: <extension01> <extension02> ...
  EXTENSION_ENABLE: 'E01',

  // Same as above.
  EXTENSION_DISABLE: 'E02',
};

export const CLIENT_COMMANDS_PERMITTED_WHILE_UNAUTHENTICATED = [
  COMMAND.VERSION,
  COMMAND.CONNECTION_TERMINATE,
  
  COMMAND.AUTH_WITH_ANONYMOUS,
  COMMAND.AUTH_WITH_TOKEN,
];

// Parses parameters forgivingly.
// The following inputs will all parse identically:
//
// ```
// '<a><b>  <c>  '
// '<a>   <b>  <c'
// ```
//
export const parseParameters = (parameterString) => {
  if(!parameterString.length) {
    return [];
  }

  let parameters = [];
  let currentParameter = null;

  let escaping = false;

  for(let i=0; i<parameterString.length; i++) {
    let character = parameterString[i];

    if(currentParameter === null) {
      if(character === '<') {
        currentParameter = '';
      }
      
      continue;
    }

    if(character === '\\' && !escaping) {
      escaping = true;
      continue;
    }

    if(escaping) {
      escaping = false;

      // Every other character is included verbatim.
      if(character === '0') {
        character = '\x00';
      }

    } else if(character === '>') {
      parameters.push(currentParameter);
      currentParameter = null;
      continue;
    }

    currentParameter += character;
  }

  if(currentParameter !== null) {
    parameters.push(currentParameter);
  }

  return parameters;
};

// A relaxed parsing function.
export const parseCommand = (command) => {
  if(typeof command !== typeof '') {
    return null;
  }

  if(!command.trim().length) {
    return null;
  }

  let firstSpaceIndex = command.indexOf(' ');

  if(firstSpaceIndex < 0) {
    return {
      code: command,
      parameters: []
    };
  }

  let code = command.substring(0, firstSpaceIndex);
  let parameters = parseParameters(command.substring(firstSpaceIndex + 1));

  if(code === '') {
    return null;
  }

  return {
    code: code,
    parameters: parameters
  };
};

let COMMAND_CODE_REGEX = /^[A-Z0-9\.]+$/;

// Throws an exception if the code is not a valid command code; returns normally otherwise.
export const validateCommandCode = (code) => {
  if(typeof code !== typeof '') {
    throw new Error('command code must be a string');
  }

  if(code.length > COMMAND_CODE_LENGTH_MAX) {
    throw new Error(`command code must be <=${COMMAND_CODE_LENGTH_MAX} characters long`);
  }

  if(COMMAND_CODE_REGEX.test(code) === false) {
    throw new Error(`command code did not match regex: '${code}'`);
  }
};

export const escapeParameter = (param) => {
  if(param === null || param === undefined) {
    return '';
  }

  if(typeof param === typeof 42) {
    param = param.toString();
  }

  if(typeof param !== typeof '') {
    return '';
  }

  return param.replace(/\\/g, '\\\\').replace(/\x00/g, '\\0').replace(/>/g, '\\>');
};

// Given a code and an array of parameters (or a singular parameter), returns the string command
// that may be sent over the network.
export const createCommand = (code, parameters) => {
  if(!Array.isArray(parameters)) {
    if(parameters === null || parameters === undefined) {
      parameters = [];
    } else {
      parameters = [parameters];
    }
  }

  validateCommandCode(code);

  parameters = parameters
    .map((param) => `<${escapeParameter(param)}>`).join(' ');

  if(parameters) {
    return `${code} ${parameters}`;
  } else {
    return code;
  }
}

export const convertParameter = (parameter, type) => {
  if(parameter === null || parameter === undefined) {
    return null;
  }
  
  try {
    if(type === 'string') {
      return parameter;
    } else if(type === 'number') {
      return parseFloat(parameter);
    } else if(type === 'int') {
      return parseInt(parameter);
    }
  } catch(err) {
    console.error('Failed to convert parameter: ', err, parameter, type);
    return undefined;
  }
}

// Given a schema, returns the parameters, or throws an error if the parameters do not match the schema in an unrecoverable way.
// Schema:
//
// ```
// [
//   {
//     name: 'channel',
//     type: 'string',
//     optional: true
//   },
// ],
// [
//   {
//     name: 'channel',
//     type: 'string'
//   }
// ]
// ```

// Given the following inputs, the above schema would result in the following:
//
// ```
// ['#general', '#a', '#b', '#c'] -> {'channel': '#general', '_repeat': [ {'channel': '#a'}, {'channel': '#b'}, {'channel': '#c'} ]}
// ['#general'] -> {'channel': '#general', '_repeat': []}
// [] -> {'channel': null, '_repeat': []}
// ['#a', '#b', '#c'] -> {'channel': '#a', '_repeat': [ {'channel': '#b'}, {'channel': '#c'} ]}
// ```
//
// For each parameter, the value will be converted automatically to the type of `value`.
// If the value cannot be converted, `undefined` will be returned; if the value is not present, `null` will be returned.
export const parametersToArguments = (parameters, regularSchema) => {

  // The current index within `parameters`.
  let index = 0;

  let results = {};

  while(index < regularSchema.length) {
    let schemaItem = regularSchema[index];
    
    if(index < parameters.length) {
      results[schemaItem.name] = convertParameter(parameters[index], schemaItem.type);
    } else {
      results[schemaItem.name] = null;
    }
    
    index += 1;
  }

  return results;
}
