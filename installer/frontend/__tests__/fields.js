/* eslint-env jest, node */

// monkey patch node's console :-/
console.debug = console.debug || console.info;

import _ from 'lodash';
import { configActions, FIELDS, FIELD_DEFAULTS, FIELD_TO_DEPS, FORMS, formActions } from '../actions';
import { Field, Form } from '../form';
import { store } from '../store';
import { toError, toExtraData, toExtraDataError, toExtraDataInFly } from '../utils';

const {dispatch} = store;

const invalid = 'is invalid';
const fieldName = 'aField';
const fieldName2 = 'bField';
const fieldName3 = 'cField';

const expectCC = (path, expected, f) => {
  const value = _.get(store.getState().clusterConfig, f ? f(path) : path);
  expect(value).toEqual(expected);
};

const updateField = (field, value) => dispatch(formActions.updateField(field, value));

beforeEach(() => {
  [FIELDS, FIELD_DEFAULTS, FIELD_TO_DEPS, FORMS].forEach(o => _.each(o, (v, k) => delete o[k]));
  dispatch(configActions.reset());
});

test('updates a Field', () => {
  expect.assertions(4);

  const name = 'aField';
  const aField = new Field(name, {
    default: 'a',
    validator: (value, cc) => {
      expect(value).toEqual('b');
      expect(cc[name]).toEqual('b');
    },
  });

  new Form('aForm', [aField]);
  dispatch(configActions.set(FIELD_DEFAULTS));

  expectCC(name, 'a');
  updateField(name, 'b');
  expectCC(name, 'b');
});

test('field dependency validator is called', done => {
  expect.assertions(1);

  const aName = 'aField';

  const aField = new Field(aName, {default: 'a'});
  const bField = new Field('bField', {
    default: 'c',
    dependencies: [aName],
    validator: (value, cc) => {
      expect(cc[aName]).toEqual('b');
      done();
    },
  });

  new Form('aForm', [aField, bField]);

  updateField(aName, 'b');
});

test('form validator is called', done => {
  expect.assertions(2);

  new Form('aForm', [new Field(fieldName, {default: 'a'})], {
    validator: value => {
      expectCC(fieldName, 'b');
      expect(value[fieldName]).toEqual('b');
      done();
    },
  });

  updateField(fieldName, 'b');
});

test('validation', async () => {
  expect.assertions(3);

  const field = new Field(fieldName, {
    default: 'a',
    validator: value => value === 'b' ? invalid : undefined,
  });

  new Form('aForm', [field]);

  expectCC(fieldName, undefined, toError);

  await updateField(fieldName, 'b');
  expectCC(fieldName, invalid, toError);

  await updateField(fieldName, 'a');
  expectCC(fieldName, undefined, toError);
});

test('ignores', async done => {
  expect.assertions(4);

  const field1 = new Field(fieldName, {default: 'a'});
  const field2 = new Field(fieldName2, {
    default: 'a',
    validator: () => invalid,
    dependencies: [fieldName],
    ignoreWhen: cc => cc[fieldName] === 'b',
  });

  const form = new Form('aForm', [field1, field2]);

  await updateField(fieldName2, 'b');
  expect(form.isValid(store.getState().clusterConfig)).toEqual(false);

  await updateField(fieldName, 'b');
  expectCC(fieldName2, invalid, toError);
  const cc = store.getState().clusterConfig;
  expect(field2.isValid(cc)).toEqual(true);
  expect(form.isValid(cc)).toEqual(true);

  done();
});

test('toExtraData', async done => {
  expect.assertions(3);

  const stuff = 'stuff';
  const field1 = new Field(fieldName, {default: 'a'});
  const field2 = new Field(fieldName2, {
    default: 'a',
    dependencies: [fieldName],
    getExtraStuff: () => Promise.resolve(stuff),
  });

  new Form('aForm', [field1, field2]);

  expectCC(fieldName2, undefined, toExtraData);

  await updateField(fieldName2, 'b');
  expectCC(fieldName2, undefined, toExtraData);

  await updateField(fieldName, 'b');
  expectCC(fieldName2, stuff, toExtraData);

  done();
});

test('toExtraDataInFly', async done => {
  expect.assertions(3);

  const field1 = new Field(fieldName, {default: 'a'});
  const field2 = new Field(fieldName2, {
    default: 'a',
    dependencies: [fieldName],
    getExtraStuff: () => new Promise(accept => {
      expectCC(fieldName2, true, toExtraDataInFly);
      accept();
      expectCC(fieldName2, false, toExtraDataInFly);
    }),
  });

  new Form('aForm', [field1, field2]);

  expectCC(fieldName2, undefined, toExtraDataInFly);
  await updateField(fieldName, 'b');

  done();
});

test('toExtraDataError', async done => {
  expect.assertions(2);

  const error = 'error';
  const field1 = new Field(fieldName, {default: 'a'});
  const field2 = new Field(fieldName2, {
    default: 'a',
    dependencies: [fieldName],
    getExtraStuff: () => Promise.reject(error),
  });

  new Form('aForm', [field1, field2]);

  expectCC(fieldName2, undefined, toExtraDataError);

  await updateField(fieldName, 'b');

  expectCC(fieldName2, error, toExtraDataError);
  done();
});

test('forms as dependencies', async done => {
  expect.assertions(4);

  const field = new Field(fieldName, {
    default: 'a',
    validator: value => value === 'b' ? 'error' : undefined,
  });

  const form1 = new Form('aForm', [field]);
  const form2 = new Form('bForm', [form1]);

  let cc = store.getState().clusterConfig;

  expect(form2.isValid(cc)).toEqual(true);
  expect(form1.isValid(cc)).toEqual(true);

  await updateField(fieldName, 'b');

  cc = store.getState().clusterConfig;
  expect(form2.isValid(cc)).toEqual(false);
  expect(form1.isValid(cc)).toEqual(false);

  done();
});

test('deep dependency chains', async done => {
  expect.assertions(6);

  const field1 = new Field(fieldName, {default: '1'});
  const field2 = new Field(fieldName2, {default: '2', dependencies: [fieldName]});
  const field3 = new Field(fieldName3, {default: '3', dependencies: [fieldName2],
    validator: (value, cc, updatedId) => new Promise(accept => {
      expect(updatedId).toEqual(fieldName);
      expect(value).toEqual('3');
      expectCC(fieldName, 'new value');
      expectCC(fieldName2, '2');
      expectCC(fieldName3, '3');
      accept();
      done();
    }),
  });

  new Form('aForm', [field1, field2, field3]);
  dispatch(configActions.set(FIELD_DEFAULTS));

  expectCC(fieldName, '1');
  await updateField(fieldName, 'new value');
});
