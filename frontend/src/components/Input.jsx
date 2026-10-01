import React from 'react';

export const Input = ({
  id,
  label,
  type = 'text',
  value,
  onChange,
  placeholder = '',
  error = '',
  helperText = '',
  required = false,
  disabled = false,
  icon: Icon = null,
  className = '',
  ...rest
}) => {
  return (
    <div className={`w-full ${className}`}>
      {label ? (
        <label
          htmlFor={id}
          className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5"
        >
          {label}
          {required ? <span className="text-red-500 ml-0.5">*</span> : null}
        </label>
      ) : null}

      <div className="relative">
        {Icon ? (
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
            <Icon className="w-4 h-4" />
          </div>
        ) : null}

        <input
          id={id}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          className={`w-full rounded-lg border bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm py-2.5 ${
            Icon ? 'pl-9 pr-3.5' : 'px-3.5'
          } transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-[#0AAF29] focus:border-transparent disabled:opacity-60 disabled:cursor-not-allowed ${
            error
              ? 'border-red-500 dark:border-red-500'
              : 'border-slate-300 dark:border-slate-700'
          }`}
          {...rest}
        />
      </div>

      {error ? (
        <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : helperText ? (
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
          {helperText}
        </p>
      ) : null}
    </div>
  );
};

export default Input;
