/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import parseISO from 'date-fns/parseISO';
import isValid from 'date-fns/isValid';
import lastDayOfYear from 'date-fns/lastDayOfYear';
import lastDayOfMonth from 'date-fns/lastDayOfMonth';
import set from 'date-fns/set';
import { InvalidSearchParameterError } from 'fhir-works-on-aws-interface';
import { CompiledSearchParam } from '../../FHIRSearchParametersRegistry';
import { prefixRangeDate } from './common/prefixRange';

interface DateSearchParameter {
    prefix: string;
    range: {
        start: Date;
        end: Date;
    };
}

const SUPPORTED_MODIFIERS: string[] = [];

// The date parameter format is yyyy-mm-ddThh:mm:ss[Z|(+|-)hh:mm] (the standard XML format).
// https://www.hl7.org/fhir/search.html#date
const DATE_SEARCH_PARAM_REGEX =
    /^(?<prefix>eq|ne|lt|gt|ge|le|sa|eb|ap)?(?<inputDate>(?<year>\d{4})(?:-(?<month>\d{2})(?:-(?<day>\d{2})(?:T(?<hours>\d{2}):(?<minutes>\d{2})(?::(?<seconds>\d{2})(?:\.(?<milliseconds>\d{3}))?(?<timeZone>Z|[+-](?:\d{2}:\d{2}))?)?)?)?)?)$/;

export const parseDateSearchParam = (param: string): DateSearchParameter => {
    const match = param.match(DATE_SEARCH_PARAM_REGEX);
    if (match === null) {
        throw new InvalidSearchParameterError(`Invalid date search parameter: ${param}`);
    }
    const { inputDate, month, day, minutes, seconds, milliseconds } = match.groups!;

    // If no prefix is present, the prefix eq is assumed.
    // https://www.hl7.org/fhir/search.html#prefix
    const prefix = match.groups!.prefix ?? 'eq';

    const parsedDate = parseISO(inputDate);
    if (!isValid(parsedDate)) {
        throw new InvalidSearchParameterError(`Invalid date format: ${inputDate}`);
    }

    // When the date parameter is not fully specified, matches against it are based on the behavior of intervals
    // https://www.hl7.org/fhir/search.html#date
    let endDate: Date;
    const timeEndOfDay = { hours: 23, minutes: 59, seconds: 59, milliseconds: 999 };
    if (milliseconds !== undefined) {
        endDate = parsedDate; // date is fully specified
    } else if (seconds !== undefined) {
        endDate = set(parsedDate, { milliseconds: 999 });
    } else if (minutes !== undefined) {
        endDate = set(parsedDate, { seconds: 59, milliseconds: 999 });
    } else if (day !== undefined) {
        endDate = set(parsedDate, timeEndOfDay);
    } else if (month !== undefined) {
        endDate = set(lastDayOfMonth(parsedDate), timeEndOfDay);
    } else {
        endDate = set(lastDayOfYear(parsedDate), timeEndOfDay);
    }

    return {
        prefix,
        range: {
            start: parsedDate,
            end: endDate,
        },
    };
};

// eslint-disable-next-line import/prefer-default-export
export const dateQuery = (compiledSearchParam: CompiledSearchParam, value: string, modifier?: string): any => {
    if (modifier && !SUPPORTED_MODIFIERS.includes(modifier)) {
        throw new InvalidSearchParameterError(`Unsupported date search modifier: ${modifier}`);
    }
    const { prefix, range } = parseDateSearchParam(value);
    return prefixRangeDate(prefix, range, compiledSearchParam.path);
};
