/**
 * @module SellerReportGenerator
 * @description Generates seller reports for the magazine rail.
 * @see docs/credal_v3/SDD-magazine.md MG-B4
 */

export interface SellerReportData {
  ownerId: string;
  buildingName: string;
  views: number;
  inquiries: number;
  marketInsights: string;
}

/**
 * Generates HTML content for a seller report.
 */
export function generateSellerReportHtml(data: SellerReportData): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Seller Report: ${data.buildingName}</title>
      <style>
        body { font-family: sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 20px; }
        .metric { font-size: 24px; font-weight: bold; color: #2563eb; }
        .insights { background: #f8fafc; padding: 15px; border-radius: 8px; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Seller Report: ${data.buildingName}</h1>
        </div>
        <div class="content">
          <p>Here is your latest performance report.</p>
          <p>Total Views: <span class="metric">${data.views}</span></p>
          <p>Total Inquiries: <span class="metric">${data.inquiries}</span></p>
          
          <div class="insights">
            <h2>Market Insights</h2>
            <p>${data.marketInsights}</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}
