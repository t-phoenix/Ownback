/** xStocks symbol → Ownback assetId. Extend when scrape finds new issuers. */
export const XSTOCKS_SYMBOL_TO_ASSET: Record<
  string,
  { assetId: string; name: string; class: 'stock' }
> = {
  AAPLx: { assetId: 'co:apple', name: 'Apple', class: 'stock' },
  TSLAx: { assetId: 'co:tesla', name: 'Tesla', class: 'stock' },
  MSFTx: { assetId: 'co:microsoft', name: 'Microsoft', class: 'stock' },
  NVDAx: { assetId: 'co:nvidia', name: 'NVIDIA', class: 'stock' },
  AMZNx: { assetId: 'co:amazon', name: 'Amazon', class: 'stock' },
  METAx: { assetId: 'co:meta', name: 'Meta', class: 'stock' },
  NFLXx: { assetId: 'co:netflix', name: 'Netflix', class: 'stock' },
  COINx: { assetId: 'co:coinbase', name: 'Coinbase', class: 'stock' },
  HOODx: { assetId: 'co:robinhood', name: 'Robinhood', class: 'stock' },
  MCDx: { assetId: 'co:mcdonalds', name: "McDonald's", class: 'stock' },
  MRKx: { assetId: 'co:merck', name: 'Merck', class: 'stock' },
  AZNx: { assetId: 'co:astrazeneca', name: 'AstraZeneca', class: 'stock' },
};
