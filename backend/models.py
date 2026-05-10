from pydantic import BaseModel


class StockInfo(BaseModel):
    code: str
    name: str
    label: str


class SectorData(BaseModel):
    name: str
    color: str
    stocks: list[StockInfo]
    matrix: list[list[float]]


class CorrelationResponse(BaseModel):
    stocks: list[StockInfo]
    matrix: list[list[float]]


class PairData(BaseModel):
    stockA: StockInfo
    stockB: StockInfo
    corr: float


class ChartData(BaseModel):
    code: str
    dates: list[str]
    closes: list[float]


class BatchStatus(BaseModel):
    id: int
    started_at: str
    finished_at: str | None
    status: str
    detail: str | None
