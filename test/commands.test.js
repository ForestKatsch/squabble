
import {COMMAND_CODE_LENGTH_MAX, parseCommand, createCommand, escapeParameter, parametersToArguments} from '../src/commands.js';
import * as assert from 'assert';

describe('parseCommand', function() {
  it('should return null when the command is not provided', function() {
    assert.strictEqual(null, parseCommand());
  });
  
  it('should return null when the command is an empty string', function() {
    assert.strictEqual(null, parseCommand(''));
  });
  
  it('should return null when the command is only whitespace', function() {
    assert.strictEqual(null, parseCommand(' '));
    assert.strictEqual(null, parseCommand('  '));
  });
  
  it('should return null when the first character of an otherwise valid command is whitespace', function() {
    assert.strictEqual(null, parseCommand(' XYZ'));
    assert.strictEqual(null, parseCommand('  XYZ'));
  });
  
  it('should return the code in an object when the command contains only a code', function() {
    assert.deepStrictEqual({
      code: 'XYZ',
      parameters: []
    }, parseCommand('XYZ'));

    assert.deepStrictEqual({
      code: '012',
      parameters: []
    }, parseCommand('012'));

    assert.notDeepStrictEqual({
      code: 'ABC',
      parameters: []
    }, parseCommand('XYZ'));

    // This command code is too long, but the parser should be forgiving.
    let longCommandCode = 'XYZABCXYZXYZABCXYZXYZABCXYZXYZABCXYZXYZABCXYZXYZABCXYZXYZABCXYZXYZABCXYZXYZABCXYZ';

    assert.ok(longCommandCode.length > COMMAND_CODE_LENGTH_MAX);
    
    assert.deepStrictEqual({
      code: longCommandCode,
      parameters: []
    }, parseCommand(longCommandCode));
  });
  
  it('should return the code in an object when the command contains only a code even if there are trailing spaces', function() {
    assert.deepStrictEqual({
      code: 'XYZ',
      parameters: []
    }, parseCommand('XYZ '));
    
    assert.deepStrictEqual({
      code: 'XYZ',
      parameters: []
    }, parseCommand('XYZ     '));
  });
  
  it('should return the code and parameters even with malformed input', function() {
    let command = {
      code: 'XYZ',
      parameters: [
        'a', 'b', 'c'
      ]
    };
    
    assert.deepStrictEqual(command, parseCommand('XYZ <a> <b> <c>'));
    assert.deepStrictEqual(command, parseCommand('XYZ <a><b><c'));
    assert.deepStrictEqual(command, parseCommand('XYZ <a>   <b>abcdefg<c>'));
    assert.deepStrictEqual(command, parseCommand('XYZ <a>   <b>abcdefg<c'));
  });
  
  it('should return the code and parameters with escaped parameters', function() {
    let command = {
      code: 'XYZ',
      parameters: [
        'a\x00', 'b>', 'c\\'
      ]
    };
    
    assert.deepStrictEqual(command, parseCommand('XYZ <a\\0> <b\\>> <c\\\\'));
  });
  
  it('should ignore less-than', function() {
    let command = {
      code: 'XYZ',
      parameters: [
        'a', 'b<', 'c>'
      ]
    };
    
    assert.deepStrictEqual(command, parseCommand('XYZ <a> <b<> <c\\>>'));
  });
  
  it('should return the first parameter as the code and parameters if passed parameters', function() {
    let command = {
      code: '<a>',
      parameters: [
        'b', 'c'
      ]
    };
    
    assert.deepStrictEqual(command, parseCommand('<a> <b> <c>'));
  });
});

describe('escapeParameter', function() {
  it('should return an empty string when provided with one', function() {
    assert.strictEqual('', escapeParameter(''));
  });
  
  it('should return an empty string when provided with a null or missing parameter', function() {
    assert.strictEqual('', escapeParameter(null));
    assert.strictEqual('', escapeParameter(undefined));
  });
  
  it('should return an empty string when provided with any non-number, non-string, and non-null parameter', function() {
    assert.strictEqual('', escapeParameter([1, 2, 3]));
    assert.strictEqual('', escapeParameter({1: 2}));
  });
  
  it('should return a locale-ignoring string when provided with a number', function() {
    assert.strictEqual('42', escapeParameter(42));
    assert.strictEqual('3.14', escapeParameter(3.14));
  });

  it('should replace null with \\0 and > with \\>', function() {
    assert.strictEqual('\\0', escapeParameter('\x00'));
    assert.strictEqual('\\>', escapeParameter('>'));
  });

  it('should replace \\ with \\\\>', function() {
    assert.strictEqual('\\\\', escapeParameter('\\'));
  });

});

// TODO: createCommand
// TODO: validateCommandCode

describe('parametersToArguments', function() {
  
  it('should return an empty object when no parameters are given', function() {
    assert.deepStrictEqual({}, parametersToArguments([], []));
  });
  
  it('should return an empty object when schema parameters are given but optional', function() {
    assert.deepStrictEqual({
      test: null,
    }, parametersToArguments([], [
      {
        name: 'test',
        type: 'string',
      }
    ]));
    
    assert.deepStrictEqual({
      test: null,
      test2: null
    }, parametersToArguments([], [
      {
        name: 'test',
        type: 'string',
      },
      {
        name: 'test2',
        type: 'string',
      }
    ]));
  });
  
  it('should return any values from the schema when present in parameters', function() {
    assert.deepStrictEqual({
      test: 'ugh'
    }, parametersToArguments(['ugh'], [
      {
        name: 'test',
        type: 'string'
      },
    ]));
    
    assert.deepStrictEqual({
      test: 'ugh',
      test2: 'ugh2'
    }, parametersToArguments(['ugh', 'ugh2'], [
      {
        name: 'test',
        type: 'string'
      },
      {
        name: 'test2',
        type: 'string'
      },
    ]));
    
    assert.deepStrictEqual({
      test: 'ugh',
      test2: null
    }, parametersToArguments(['ugh'], [
      {
        name: 'test',
        type: 'string',
      },
      {
        name: 'test2',
        type: 'string',
      },
    ]));
    
  });

  it('should convert numbers if specified in schema', function() {
    assert.deepStrictEqual({
      test: 42
    }, parametersToArguments(['42'], [
      {
        name: 'test',
        type: 'number'
      }
    ]));
    
  });
  
  it('should convert numbers if specified in schema', function() {
    assert.deepStrictEqual({
      test: 42
    }, parametersToArguments(['42'], [
      {
        name: 'test',
        type: 'number'
      }
    ]));
    
  });
  
});
