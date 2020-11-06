
import {getTimestamp} from './util.js';

import EventEmitter from 'events';

export default class Channel extends EventEmitter {
  
  constructor(name) {
    super();
    
    this.name = name;

    this.messages = [];
  }

  message(user, message, flags) {
    let msgData = {
      time: getTimestamp(),
      user: user,
      message: message,
      flags: flags
    };
    
    this.messages.push(msgData);

    this.emit('message', {
      channel: this,
      message: msgData
    });
  }
  
}
