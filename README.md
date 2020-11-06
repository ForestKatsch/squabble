
# Squabble

Super-simple chat protocol, in the style of `irc` but more secure and with more user-friendly features.
This could also be called `Yet Another IRC`.

# Comparison to IRC

| Feature | Squabble | IRC |
| ------- | -------- | --- |
| Authentication | **Always** | Bot-level (NickServ) |
| In-Transit Encryption | **Always** | Sometimes |
| End-to-End Encryption | No | No |
| Backlog Replay | **Yes** | No |
| Relay Servers | Not Yet | **Yes** |

# Connection

Default port: 21759

TLS is **enforced** and always enabled.

Clients are **always** authenticated.

# Channels

Any channel whose first character is `#` is guaranteed to be a multi-user channel.

Any channel whose first character is `@` is guaranteed to be a one-on-one channel (aka PM/DM.)

All other first characters are invalid, except where used by extensions.

# Protocol

Commands are separated by the null character (`\0`).
Commands start with the command code, followed by a single space, followed by a list of parameters.

Command codes consist one to 32 alphanumeric values, or the period character.

Parameters consist of a list of singular parameters, separated by a single space, and optionally surrounded by angle brackets.
Any character except `\0` is valid within angle brackets; the only exception is a regular close bracket, which must be prefixed with a backslash.

The below is *approximately* correct:

```
command: '<code> <parameters>'
code: '[A-Z0-9\.]{1,32}'
parameters: '(<parameter> )*'
parameter: '<quoted_parameter|bare_parameter>'
quoted_parameter: '\<.*\>'
bare_parameter: '.*'
```

## Handshaking

For security and DoS-prevention reasons, before a client is authenticated, the server will only respond to a short whitelist of commands:

* `V01`: for getting the version of the server
* `A??`: for authentication

The server must not reject any command under 512 characters in length before the client is authenticated.
The server may terminate a client if it detects DoS attempts.

A handshake looks like the following:

```
Client: V01 <squabble-client> 3
Server: V01 <squabble-server> 4
Client: A11 <aHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g>
Server: A00
```

A failed handshake would look like the following:

```
Client: V01 <squabble-client> 6
Server: X00 <4>
---
```

```
Client: V01 <squabble-client> 3
Server: V01 <squabble-server> 4
Client: A11 <aHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g>
Server: X00 <token>
---
```

## Receiving messages

The client must start listening to channels before it receives messages.

```
...
Client: M10 # #general #off-topic
Server: M10 # #general #off-topic
```

