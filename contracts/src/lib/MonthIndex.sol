// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// UTC calendar month from a unix timestamp: year * 12 + (month - 1).
library MonthIndex {
    function monthOf(uint256 t) internal pure returns (uint32) {
        // Howard Hinnant's civil_from_days, unsigned because t >= 0.
        uint256 z = t / 86400 + 719468;
        uint256 era = z / 146097;
        uint256 doe = z - era * 146097;
        uint256 yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
        uint256 doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        uint256 mp = (5 * doy + 2) / 153;
        uint256 m = mp < 10 ? mp + 3 : mp - 9;
        uint256 y = yoe + era * 400 + (m <= 2 ? 1 : 0);
        return uint32(y * 12 + (m - 1));
    }
}
