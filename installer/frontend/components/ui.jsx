import _ from 'lodash';
import classNames from 'classnames';
import { Set as ImmutableSet } from 'immutable';
import React from 'react';
import { connect } from 'react-redux';

import { withNav } from '../nav';
import { validate } from '../validate';
import { readFile } from '../readfile';
import { TectonicGA } from '../tectonic-ga';
import { toError, toExtraData, toInFly, toExtraDataInFly, toExtraDataError } from '../utils';

import { dirtyActions, formActions } from '../actions';
import { DESELECTED_FIELDS, PLATFORM_TYPE } from '../cluster-config.js';

import { Alert } from './alert';

// Taken more-or-less from https://www.w3.org/TR/html5/forms.html#the-input-element
const FIELD_PROPS = ImmutableSet([
  'accept',
  'accesskey',
  'alt',
  'autocomplete',
  'autoFocus', // Funny case required by react input management magic
  'checked',
  'dirname',
  'disabled',
  'form',
  'formaction',
  'formenctype',
  'formmethod',
  'formnovalidate',
  'formtarget',
  'height',
  'hidden',
  'id',
  'inputmode',
  'lang',
  'list',
  'max',
  'maxlength',
  'min',
  'minlength',
  'multiple',
  'name',
  'pattern',
  'placeholder',
  'onChange',
  'readonly',
  'required',
  'size',
  'spellcheck',
  'src',
  'step',
  'style',
  'tabindex',
  'title',
  'type',
  'width',
]);

export const ExternalLinkIcon = () => <i className="fa fa-external-link" style={{marginLeft: 5}} />;

export const localeNum = num => num.toLocaleString('en', {useGrouping: true});

// Same as an <a> except defaults to rel="noopener noreferrer" and target="_blank"
export const A = props => <a rel="noopener noreferrer" target="_blank" {...props} />;

export const DocsA = connect(({clusterConfig}) => ({platform: clusterConfig[PLATFORM_TYPE]}))(props => <a
  {..._.omit(props, ['dispatch', 'path', 'platform'])}
  href={`https://coreos.com/tectonic/docs/latest${props.path}`}
  onClick={() => TectonicGA.sendDocsEvent(props.platform)}
  rel="noopener"
  target="_blank"
/>);

export const ErrorComponent = props => {
  const error = props.error;
  if (props.ErrorComponent) {
    return <props.ErrorComponent error={error} />;
  }
  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }
  return <span />;
};

const Field = withNav(connect(
  (state, {id}) => ({isDirty: _.get(state.dirty, id)}),
  (dispatch, {id}) => ({makeDirty: () => dispatch(dirtyActions.add(id))}),
)(props => {
  const tag = props.tag || 'input';
  const isInvalid = props.invalid && (props.forceDirty || props.isDirty);
  const fieldClasses = classNames(props.className, {'wiz-invalid': isInvalid});
  const errorClasses = classNames('wiz-error-message', {hidden: !isInvalid});

  const elementProps = {};
  Object.keys(props).filter(k => FIELD_PROPS.has(k)).forEach(k => {
    elementProps[k] = props[k];
  });

  const onEnterKeyNavigateNext = e => {
    if (e.keyCode === 13) {
      e.preventDefault();
      props.navNext();
    }
  };

  const nextProps = Object.assign({
    className: fieldClasses,
    value: props.value || '',
    autoCorrect: 'off',
    autoComplete: 'off',
    spellCheck: 'false',
    children: undefined,
    onPaste: props.makeDirty,
    onChange: e => {
      if (props.onValue) {
        props.onValue(e.target.value);
      }
    },
    onBlur: e => {
      if (e.target.value) {
        props.makeDirty();
      }
    },
    onKeyDown: ['number', 'password', 'text'].includes(props.type) ? onEnterKeyNavigateNext : undefined,
  }, elementProps);

  return (
    <div>
      {props.prefix}
      {props.renderField
        ? props.renderField(props, elementProps, fieldClasses)
        : React.createElement(tag, nextProps)
      }
      {props.suffix}
      {props.children}
      <div className={errorClasses}>
        {props.invalid}
      </div>
    </div>
  );
}));

const makeBooleanField = type => {
  return function booleanField (props) {
    const renderField = (injectedProps, cleanedProps, classes) => {
      return <input type={type} checked={injectedProps.inverted ? !injectedProps.value : injectedProps.value} className={classes} {...cleanedProps}
        onChange={e => {
          const value = injectedProps.inverted ? !e.target.checked : !!e.target.checked;
          injectedProps.onValue(value);
          if (props.onChange) {
            props.onChange(value);
          }
        }}
        onBlur={injectedProps.makeDirty}
      />;
    };
    return <Field {...props} renderField={renderField} />;
  };
};

// component for uninteresting input[type="text"] fields.
// Handles error displays and boilerplate attributes.
// <Input id:REQUIRED invalid="error message" placeholder value onValue />
export const Input = props => <Field tag="input" type="text" {...props}>{props.children}</Field>;

// If props.validator is specified, use it to override any existing props.invalid error
export const CIDR = props => props.validator
  ? <Input {...props} invalid={props.validator(props.value)} />
  : <Input {...props} />;

export const NumberInput = props => <Field tag="input" type="number" onChange={e => {
  const number = parseInt(e.target.value, 10);
  props.onValue(isNaN(number) ? 0 : number);
}} {...props} />;

export const Password = props => <Field tag="input" type="password" {...props} />;

export const RadioBoolean = makeBooleanField('radio');

export const Radio = props => {
  const renderField = (injectedProps, cleanedProps, classes) => {
    return <input type="radio" className={classes} {...cleanedProps}
      onChange={() => {
        injectedProps.onValue(props.value);
        if (props.onChange) {
          props.onChange(props.value);
        }
      }}
      onBlur={injectedProps.makeDirty}
    />;
  };
  return <Field {...props} renderField={renderField} />;
};

export const CheckBox = makeBooleanField('checkbox');

export const ToggleButton = connect(
  null,
  (dispatch, {id, onValue, value}) => ({onClick: () => {
    onValue(!value);
    dispatch(dirtyActions.add(id));
  }}),
)(({children, className, id, onClick, value}) => <button className={className} id={id} onClick={onClick}>
  {value ? 'Hide' : 'Show'}&nbsp;{children}
  <i style={{marginLeft: 7}} className={classNames('fa', {'fa-chevron-up': value, 'fa-chevron-down': !value})}></i>
</button>);

export const FileInput = connect(
  null,
  (dispatch, {id}) => ({makeDirty: () => dispatch(dirtyActions.add(id))}),
)(({id, makeDirty, onValue}) => {
  const upload = e => {
    readFile(e.target.files.item(0))
      .then(onValue)
      .catch(msg => console.error(msg))
      .then(makeDirty);

    // Reset value so that onChange fires if you pick the same file again.
    e.target.value = null;
  };
  return <input type="file" id={id} onChange={upload} style={{display: 'none'}} />;
});

// A textarea/file-upload combo
// <FileArea id:REQUIRED invalid="error message" placeholder value onValue>
export const FileArea = props => {
  const {id, onValue, uploadButtonLabel} = props;
  return <div>
    <label className="btn btn-sm btn-link">
      <span className="fa fa-upload"></span>&nbsp;&nbsp;{uploadButtonLabel || 'Upload'}
      <FileInput id={id} onValue={onValue} />
    </label>
    <Field {...props} tag="textarea" />
  </div>;
};

// <Select id:REQUIRED value onValue>
//   <option....>
// </Select>
export const Select = ({id, children, value, onValue, invalid, isDirty, makeDirty, options, className, disabled, style}) => {
  const optionElems = [];
  if (options) {
    if (value && !options.map(r => r.value).includes(value)) {
      options = [{label: value, value}].concat(options);
    }

    const optgroups = new Map();

    _.each(options, o => {
      const elem = <option key={o.value} value={o.value}>{o.label}</option>;
      if (!o.optgroup) {
        optionElems.push(elem);
        return;
      }

      if (!optgroups.get(o.optgroup)) {
        optgroups.set(o.optgroup, []);
      }
      optgroups.get(o.optgroup).push(elem);
    });

    optgroups.forEach((child, label) => optionElems.push(<optgroup key={label} label={label}>{child}</optgroup>));
  }

  return (
    <div className={className} style={style}>
      <select id={id} value={value} disabled={disabled} style={value === '' ? {color: '#aaa'} : undefined} onChange={e => {
        makeDirty();
        onValue(e.target.value);
      }}>
        {children}
        {optionElems}
      </select>
      {invalid && isDirty &&
        <div className="wiz-error-message">
          {invalid}
        </div>
      }
    </div>
  );
};

export const AsyncSelect = connect(
  ({clusterConfig: cc}, {id}) => ({
    extraData: _.get(cc, toExtraData(id)),
    inFly: _.get(cc, toInFly(id)) || _.get(cc, toExtraDataInFly(id)),
  }),
  (dispatch, {id}) => ({refreshExtraData: () => dispatch(formActions.refreshExtraData(id))})
)(props => {
  const value = props.value;
  const options = _.get(props, 'extraData.options', []);

  if (value && !options.map(r => r.value).includes(value)) {
    options.splice(0, 0, {value, label: value});
  }

  const optionsElems = options.map(o => <option value={o.value} key={o.value}>{o.label}</option>);
  if (props.disabledValue) {
    optionsElems.splice(0, 0, <option disabled={true} key="disabled" value="">{props.disabledValue}</option>);
  }

  const style = Object.assign({}, props.style || {});
  if (!props.refreshBtn) {
    style.marginRight = 0;
  }
  const iClassNames = classNames('fa', 'fa-refresh', {
    'fa-spin': props.inFly,
  });

  return <div className="async-select">
    <Select className="async-select--select" {...props} style={style}>{optionsElems}</Select>
    {props.refreshBtn && <button className="btn btn-default" onClick={props.refreshExtraData} title="Refresh">
      <i className={iClassNames}></i>
    </button>}
  </div>;
});

const stateToProps = ({clusterConfig, dirty}, {field}) => ({
  invalid: _.get(clusterConfig, toError(field)) || _.get(clusterConfig, toExtraDataError(field)),
  isDirty: _.get(dirty, field),
  value: _.get(clusterConfig, field),
});

const dispatchToProps = (dispatch, {field}) => ({
  makeDirty: () => dispatch(dirtyActions.add(field)),
  updateField: v => dispatch(formActions.updateField(field, v)),
});

class Connect_ extends React.Component {
  handleValue (v) {
    const {children, updateField} = this.props;
    const child = React.Children.only(children);

    updateField(v);
    if (child.props.onValue) {
      child.props.onValue(v);
    }
  }

  componentDidMount () {
    const {getDefault} = this.props;

    if (_.isFunction(getDefault)) {
      this.handleValue(getDefault());
    }
  }

  render () {
    const {children, field, invalid, isDirty, makeDirty, value} = this.props;

    const child = React.Children.only(children);
    const id = child.props.id || field;

    const props = {
      id,
      invalid,
      isDirty,
      makeDirty,
      onValue: v => this.handleValue(v),
    };

    switch (child.type) {
    case Radio:
      props.checked = child.props.value === value;
      break;
    case Select:
    case AsyncSelect:
      props.value = value || '';
      break;
    default:
      props.value = value;
      break;
    }

    return React.cloneElement(child, props);
  }
}

export const Connect = connect(stateToProps, dispatchToProps)(Connect_);

// If undefined, default to not deselected
const stateToIsDeselected = ({clusterConfig}, {field}) => {
  field = `${DESELECTED_FIELDS}.${field}`;
  return {
    field,
    isDeselected: !!_.get(clusterConfig, field),
  };
};

export const Deselect = connect(
  stateToIsDeselected,
  {updateField: formActions.updateField}
)(({field, isDeselected, label, updateField}) => <div>
  <span className="deselect">
    <CheckBox id={field} value={!isDeselected} onValue={v => updateField(field, !v)} />
  </span>
  <label htmlFor={field}>{label}</label>
</div>);

export const DeselectField = connect(stateToIsDeselected)(({children, isDeselected}) => React.cloneElement(
  React.Children.only(children),
  {disabled: isDeselected}
));

const certPlaceholder = `Paste your certificate here. It should start with:

-----BEGIN CERTIFICATE-----

It should end with:

-----END CERTIFICATE-----`;

export const CertArea = (props) => <FileArea
  {...props}
  className="wiz-tls-asset-field"
  invalid={validate.certificate(props.value)}
  placeholder={certPlaceholder}
/>;

const privateKeyPlaceholder = `Paste your private key here. It should start with:

-----BEGIN RSA PRIVATE KEY-----

It should end with:

-----END RSA PRIVATE KEY-----`;

export const PrivateKeyArea = (props) => <FileArea
  {...props}
  className="wiz-tls-asset-field"
  invalid={validate.privateKey(props.value)}
  placeholder={privateKeyPlaceholder}
/>;

export const FieldRowList = connect(
  ({clusterConfig}, {id}) => ({
    globalError: _.get(clusterConfig, `${toError(id)}.global`),
    rowIndexes: _.keys(clusterConfig[id]),
  }),
  {appendRow: formActions.appendFieldListRow, removeRow: formActions.removeFieldListRow}
)(
  class FieldRowList_ extends React.Component {
    constructor (props) {
      super(props);
      this.state = {
        autoFocus: props.autoFocus,
      };
    }

    render () {
      const {appendRow, globalError, id, placeholder, removeRow, Row, rowFields, rowIndexes} = this.props;

      return <div>
        {_.map(rowIndexes, i => {
          const row = _.mapValues(rowFields, (v, k) => `${id}.${i}.${k}`);
          return <div className="row" key={i} style={{padding: '0 0 20px 0'}}>
            <Row autoFocus={this.state.autoFocus && i === _.last(rowIndexes)} placeholder={placeholder} row={row} />
            <div className="col-xs-1">
              <i className="fa fa-minus-circle list-add-or-subtract pull-right" onClick={() => removeRow(id, i)}></i>
            </div>
          </div>;
        })}
        <div className="row">
          <div className="col-xs-3">
            <span className="wiz-link" id="addMore" onClick={() => {
              this.setState({autoFocus: true});
              appendRow(id);
            }}>
              <i className="fa fa-plus-circle list-add wiz-link"></i>&nbsp; Add More
            </span>
          </div>
        </div>
        <div className="row">
          <div className="col-xs-12" style={{margin: '10px 0'}}>
            <ErrorComponent error={globalError} />
          </div>
        </div>
      </div>;
    }
  }
);

export class DropdownMixin extends React.PureComponent {
  constructor (props) {
    super(props);
    this.listener = this._onWindowClick.bind(this);
    this.state = {active: !!props.active};
    this.toggle = this.toggle.bind(this);
    this.hide = this.hide.bind(this);
  }

  _onWindowClick ( event ) {
    if (!this.state.active ) {
      return;
    }

    if (event.target === this.dropdownElement || this.dropdownElement.contains(event.target)) {
      return;
    }
    this.hide();
  }

  componentDidMount () {
    window.addEventListener('click', this.listener);
  }

  componentWillUnmount () {
    window.removeEventListener('click', this.listener);
  }

  onClick_ (key, e) {
    e.stopPropagation();
    this.setState({active: false});
  }

  toggle () {
    this.setState({active: !this.state.active});
  }

  hide (e) {
    e && e.stopPropagation();
    this.setState({active: false});
  }
}

export class DropdownInline extends DropdownMixin {
  render () {
    const {active} = this.state;
    const {items, header} = this.props;

    return (
      <div ref={el => this.dropdownElement = el} className="dropdown" onClick={this.toggle} style={{display: 'inline-block'}}>
        <a>{header}&nbsp;&nbsp;<i className="fa fa-caret-down"></i></a>
        <ul className="dropdown-menu--dark" style={{display: active ? 'block' : 'none'}}>
          {items.map(([title, cb], i) => <li className="dropdown-menu--dark__item" key={i} onClick={cb}>{title}</li>)}
        </ul>
      </div>
    );
  }
}

export const AppError = () => <div className="wiz-wizard">
  <div className="wiz-wizard__cell wiz-wizard__content">
    The Tectonic Installer has encountered an error. Please contact Tectonic support.
  </div>
</div>;

export class ErrorBoundary extends React.Component {
  constructor (props) {
    super(props);
    this.state = {hasError: false};
  }

  componentDidCatch () {
    this.setState({hasError: true});
  }

  render () {
    return this.state.hasError ? <AppError /> : this.props.children;
  }
}
