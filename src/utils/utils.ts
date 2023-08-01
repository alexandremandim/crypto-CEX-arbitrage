import BigNumber from 'bignumber.js';
import _ from 'lodash';

export const calculateROI = (oldValue: BigNumber, newValue: BigNumber) => new BigNumber(newValue.minus(oldValue).div(oldValue));