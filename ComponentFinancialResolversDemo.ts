import { GraphQLResolveInfo } from 'graphql';
import {
    LiquidityPoolDailySnapshot,
    LiquidityPoolHourlySnapshot,
    MeshContext,
} from '../../../.graphclient';
import { rf } from '../../constants/riskFreeRate';
import Decimal from 'decimal.js';
import { getDailyAnnualPriceReturn } from '../LiquidityPoolDailySnapshots/AnnualPriceReturn';
import { GetSpecificPriceReturnType } from './types/types';
import { getDailyAnnualPriceVolatility } from '../LiquidityPoolDailySnapshots/AnnualPriceVolatility';
import { getLaggedSnapshots } from './getLaggedSnapshots';
import { decimalSum } from '../../utils/decimalMath';
import { GetSpecifiedRateType } from './types/types';

export const getROI = async <
    TSnapshot extends LiquidityPoolDailySnapshot | LiquidityPoolHourlySnapshot,
>(
    parent: TSnapshot,
    args: { lag: number },
    context: MeshContext,
    info: GraphQLResolveInfo,
    lagSelectionSet: string,
    rateFunction: GetSpecifiedRateType,
    property: 'dailySnapshots' | 'hourlySnapshots',
    yearlyInInterval: number,
    IntervalInSeconds: number,
): Promise<Decimal | null> => {
    const periodLength = args.lag + 1;
    // first get all the days in the lag period
    // then we do some reduction operations
    const lagPeriodSnapshots = await getLaggedSnapshots<TSnapshot>(
        args.lag,
        lagSelectionSet,
        parent,
        context,
        info,
        property,
        IntervalInSeconds,
    );

    // string to return, keep big int/big decimal for as long as possible.
    const totalOverPeriod = decimalSum(
        lagPeriodSnapshots.map((snapshot) => rateFunction(snapshot)),
    );
    // total rewards is sum of DailyFeesRate
    const periodsInAYear = new Decimal(yearlyInInterval / periodLength);
    return totalOverPeriod.add(1).pow(periodsInAYear).minus(1);
};

export const getSharpeRatio = async <
    TSnapshot extends LiquidityPoolDailySnapshot | LiquidityPoolHourlySnapshot,
>(
    parent: TSnapshot,
    args: { lag: number },
    context: MeshContext,
    info: GraphQLResolveInfo,
    annualPriceReturnFunction: GetSpecificPriceReturnType = getDailyAnnualPriceReturn as GetSpecificPriceReturnType,
    annualPriceVolatilityFunction: GetSpecificPriceReturnType = getDailyAnnualPriceVolatility as GetSpecificPriceReturnType,
): Promise<Decimal> => {
    let annualPriceReturnDecimals, annualPriceVolatility;
    if (parent.AnnualPriceReturn == undefined) {
        annualPriceReturnDecimals = await annualPriceReturnFunction(parent, args, context, info);
    } else {
        annualPriceReturnDecimals = new Decimal(parent.AnnualPriceReturn);
    }
    if (parent.AnnualPriceVolatility == undefined) {
        annualPriceVolatility = await annualPriceVolatilityFunction(parent, args, context, info);
    } else {
        annualPriceVolatility = new Decimal(parent.AnnualPriceVolatility);
    }
    // SharpRatio:
    return annualPriceReturnDecimals.minus(rf).div(annualPriceVolatility);
};
