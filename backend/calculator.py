import numpy as np
import pandas as pd


def corr_matrix_from_prices(prices: pd.DataFrame, codes: list[str]) -> list[list[float]]:
    """Calculate a correlation matrix from a close-price DataFrame."""
    prices = prices.reindex(columns=codes)
    returns = prices.pct_change().dropna(how="all")
    corr = returns.corr()

    n = len(codes)
    matrix: list[list[float]] = []
    for i in range(n):
        row: list[float] = []
        for j in range(n):
            try:
                val = float(corr.iloc[i, j])
            except (IndexError, KeyError):
                val = float("nan")
            if np.isnan(val):
                val = 1.0 if i == j else 0.0
            row.append(round(val, 4))
        matrix.append(row)
    return matrix
