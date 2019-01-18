const P1Reader = require('p1-reader');
const Influx = require('influx');
const config = require('./config.json');

let cache = [];
const cacheMaxLength = 10000; // To prevent memory issues when InfluxDB is not available for a long time
const cacheRetryBatchSize = 300; // Size of the batch to retry sending data to InfluxDB
const influxMeasurement = 'p1-readings';

// Instantiate P1 Reader en InfluxDB
const p1Reader = new P1Reader({debug: true});
const influx = new Influx.InfluxDB({
    database: config.database,
    host: config.host,
    protocol: config.protocol || 'http',
    port: config.port || 8086,
    username: config.username,
    password: config.password,
    schema: [
      {
        measurement: influxMeasurement,
        fields: {
            electricity_tarrif1: Influx.FieldType.FLOAT,
            electricity_tarrif2: Influx.FieldType.FLOAT,
            electricity_actual: Influx.FieldType.FLOAT,
            gas_reading: Influx.FieldType.FLOAT
        },
        tags: []
      }
    ]
  });

// Log that we are connected to the P1 port
p1Reader.on('connected', portConfig => {
    console.log('Connection with the Smart Meter has been established on port: ' + portConfig.port
        + ' (BaudRate: ' + portConfig.baudRate + ', Parity: ' + portConfig.parity + ', Databits: '
        + portConfig.dataBits + 'Stopbits: ' + portConfig.stopBits + ')');
});

p1Reader.on('reading', data => {
    writeToInfluxDB([{
        timestamp: data.timestamp,
        electricity_tarrif1: data.electricity.received.tariff1.reading,
        electricity_tarrif2: data.electricity.received.tariff2.reading,
        electricity_actual: data.electricity.received.actual.reading,
        gas_reading: data.gas.reading
    }]);
});

p1Reader.on('error', error => {
    console.log('ERROR:', error);
});

p1Reader.on('close', () => {
    console.log('Connection closed');
});

// Handle all uncaught errors without crashing
process.on('uncaughtException', error => {
    console.error(error);
});

// Retry to process a batch of undelivered data every 5 minutes
setInterval(() => {
    if (cache.length > 0) {
        console.log('Retrying sending a batch of previously undelivered data to InfluxDB');

        let retryDatapoints = [];
    
        // Get a batch of cached items to be send all at once
        for(let i = 1; i <= cacheRetryBatchSize; i++) {
            retryDatapoints.push(cache.shift());
    
            if (cache.length == 0) {
                break;
            }
        }
    
        writeToInfluxDB(retryDatapoints);
    }
}, 1 * 60 * 1000);

// Write an array of data points to InfluxDB
function writeToInfluxDB (dataPoints) {
    let influxPoints = [];

    for (let i = 0; i < dataPoints.length; i++) {
        influxPoints.push({
            measurement: influxMeasurement,
            tags: {},
            fields: { 
                electricity_tarrif1: dataPoints[i].electricity_tarrif1,
                electricity_tarrif2: dataPoints[i].electricity_tarrif2,
                electricity_actual: dataPoints[i].electricity_actual,
                gas_reading: dataPoints[i].gas_reading
            },
            timestamp: new Date(dataPoints[i].timestamp)
        });
    }

    // Write P1 readings to the InfluxDB server
    influx.writePoints(influxPoints, { precision: 's' })
    .catch(error => {
        // Cache the data and try again later since we could not store it right now
        cacheUndeliveredData(dataPoints);
    });
}

// Cache data that could not be delivered to the InfluxDB server to be processed later
function cacheUndeliveredData (dataPoints) {
    while (dataPoints.length > 0) {
        let point = dataPoints.shift();

        cache.push({
            timestamp: point.timestamp,
            electricity_tarrif1: point.electricity_tarrif1,
            electricity_tarrif2: point.electricity_tarrif2,
            electricity_actual: point.electricity_actual,
            gas_reading: point.gas_reading
        });

        // Remove the oldest item if we reached the cache max length to prevent memory issues
        if (cache.length > cacheMaxLength) {
            cache.shift();
        }
    }
}