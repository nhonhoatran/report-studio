import * as echarts from 'echarts/core';
import { BarChart, FunnelChart, GaugeChart, HeatmapChart, LineChart, MapChart, PieChart, RadarChart, ScatterChart, TreemapChart } from 'echarts/charts';
import {
  DatasetComponent, GridComponent, LegendComponent, MarkLineComponent, RadarComponent, TooltipComponent, VisualMapComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

// Only the series and components the renderer uses are bundled (see options.ts).
echarts.use([
  BarChart, LineChart, PieChart, ScatterChart, FunnelChart, TreemapChart, HeatmapChart, RadarChart, GaugeChart, MapChart,
  DatasetComponent, GridComponent, LegendComponent, TooltipComponent, VisualMapComponent, MarkLineComponent, RadarComponent,
  CanvasRenderer,
]);

export { echarts };
