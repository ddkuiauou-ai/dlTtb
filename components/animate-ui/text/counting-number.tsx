'use client';

import * as React from 'react';
import {
  type SpringOptions,
  type UseInViewOptions,
  useInView,
  useMotionValue,
  useSpring,
} from 'motion/react';

type CountingNumberProps = React.ComponentProps<'span'> & {
  number: number;
  fromNumber?: number;
  padStart?: boolean;
  inView?: boolean;
  inViewMargin?: UseInViewOptions['margin'];
  inViewOnce?: boolean;
  decimalSeparator?: string;
  transition?: SpringOptions;
  decimalPlaces?: number;
};

function CountingNumber({
  ref,
  number,
  fromNumber = 0,
  padStart = false,
  inView = false,
  inViewMargin = '0px',
  inViewOnce = true,
  decimalSeparator = '.',
  transition = { stiffness: 90, damping: 50 },
  decimalPlaces = 0,
  className,
  ...props
}: CountingNumberProps) {
  const localRef = React.useRef<HTMLSpanElement>(null);
  React.useImperativeHandle(ref, () => localRef.current as HTMLSpanElement);

  const numberStr = number.toString();
  const decimals =
    typeof decimalPlaces === 'number'
      ? decimalPlaces
      : numberStr.includes('.')
        ? (numberStr.split('.')[1]?.length ?? 0)
        : 0;

  const motionVal = useMotionValue(fromNumber);
  const springVal = useSpring(motionVal, transition);
  const inViewResult = useInView(localRef, {
    once: inViewOnce,
    margin: inViewMargin,
  });
  const isInView = !inView || inViewResult;

  React.useEffect(() => {
    if (isInView) motionVal.set(number);
  }, [isInView, number, motionVal]);

  const formatValue = React.useCallback(
    (value: number) => {
      let formatted =
        decimals > 0 ? value.toFixed(decimals) : Math.round(value).toString();

      if (decimals > 0) {
        formatted = formatted.replace('.', decimalSeparator);
      }

      if (padStart) {
        const finalIntLength = Math.floor(Math.abs(number)).toString().length;
        const [intPart, fracPart] = formatted.split(decimalSeparator);
        const paddedInt = intPart?.padStart(finalIntLength, '0') ?? '';
        formatted = fracPart ? `${paddedInt}${decimalSeparator}${fracPart}` : paddedInt;
      }

      return formatted;
    },
    [decimals, decimalSeparator, number, padStart],
  );

  React.useEffect(() => {
    const unsubscribe = springVal.on('change', (latest) => {
      if (localRef.current) {
        localRef.current.textContent = formatValue(latest);
      }
    });
    return () => unsubscribe();
  }, [springVal, formatValue]);

  const initialText = formatValue(fromNumber);

  return (
    <span
      ref={localRef}
      data-slot="counting-number"
      className={className}
      {...props}
    >
      {initialText}
    </span>
  );
}

export { CountingNumber, type CountingNumberProps };
