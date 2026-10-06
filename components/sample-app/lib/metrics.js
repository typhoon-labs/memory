// Prometheus text exposition (format 0.0.4) for counters, gauges and
// histograms. Small on purpose: no dependency, no label validation.

const escapeValue = (value) => String(value).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');

function formatLabels(labels) {
  const pairs = Object.entries(labels).map(([key, value]) => `${key}="${escapeValue(value)}"`);
  return pairs.length ? `{${pairs.join(',')}}` : '';
}

class Metric {
  constructor(registry, type, name, help) {
    this.registry = registry;
    this.type = type;
    this.name = name;
    this.help = help;
    this.series = new Map();
  }

  entry(labels, create) {
    const key = JSON.stringify(labels);
    if (!this.series.has(key)) this.series.set(key, { labels, ...create() });
    return this.series.get(key);
  }

  line(suffix, labels, value) {
    return `${this.name}${suffix}${formatLabels({ ...this.registry.defaultLabels, ...labels })} ${value}`;
  }

  render() {
    return [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} ${this.type}`, ...this.lines()].join('\n');
  }
}

class Counter extends Metric {
  // inc(labels, 0) creates the series at zero, so that rate() sees the first
  // real increment and dashboards show a flat zero instead of "no data".
  inc(labels = {}, amount = 1) {
    this.entry(labels, () => ({ value: 0 })).value += amount;
  }

  lines() {
    return [...this.series.values()].map(({ labels, value }) => this.line('', labels, value));
  }
}

class Gauge extends Metric {
  constructor(registry, type, name, help, read) {
    super(registry, type, name, help);
    this.read = read;
  }

  lines() {
    return [this.line('', {}, this.read())];
  }
}

class Histogram extends Metric {
  constructor(registry, name, help, buckets) {
    super(registry, 'histogram', name, help);
    this.buckets = buckets;
  }

  observe(labels, value) {
    const entry = this.entry(labels, () => ({ counts: this.buckets.map(() => 0), sum: 0, count: 0 }));
    this.buckets.forEach((bound, i) => {
      if (value <= bound) entry.counts[i] += 1;
    });
    entry.sum += value;
    entry.count += 1;
  }

  lines() {
    return [...this.series.values()].flatMap(({ labels, counts, sum, count }) => [
      ...this.buckets.map((bound, i) => this.line('_bucket', { ...labels, le: bound }, counts[i])),
      this.line('_bucket', { ...labels, le: '+Inf' }, count),
      this.line('_sum', labels, sum),
      this.line('_count', labels, count),
    ]);
  }
}

export class Registry {
  constructor(defaultLabels = {}) {
    this.defaultLabels = defaultLabels;
    this.metrics = [];
  }

  add(metric) {
    this.metrics.push(metric);
    return metric;
  }

  counter(name, help) {
    return this.add(new Counter(this, 'counter', name, help));
  }

  // `read` is called at scrape time. `type` lets a process counter that the
  // runtime already accumulates be exposed without tracking it twice.
  gauge(name, help, read, type = 'gauge') {
    return this.add(new Gauge(this, type, name, help, read));
  }

  histogram(name, help, buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]) {
    return this.add(new Histogram(this, name, help, buckets));
  }

  render() {
    return `${this.metrics.map((metric) => metric.render()).join('\n')}\n`;
  }
}
