const P1Reader = require('p1-reader');
const Influx = require('influx');
const fs = require('fs');
const config = require('./config.json');

const undeliveredDataFile = 'undeliveredData.csv';

// Instantiate P1 Reader en InfluxDB
const p1Reader = new P1Reader();
const influx = new Influx.InfluxDB({
    database: config.database,
    host: config.host,
    protocol: config.protocol || 'http',
    port: config.port || 8086,
    username: config.username,
    password: config.password,
    schema: [
      {
        measurement: 'p1-readings',
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
    // Write P1 readings to the InfluxDB server
    influx.writePoints([
        {
            measurement: 'p1-readings',
            tags: {},
            fields: { 
                electricity_tarrif1: data.electricity.received.tariff1.reading,
                electricity_tarrif2: data.electricity.received.tariff2.reading,
                electricity_actual: data.electricity.received.actual.reading,
                gas_reading: data.gas.reading
            },
            timestamp: new Date(data.timestamp),
        }
        ], {
            precision: 's',
        })
        .catch(error => {
            // Cache the data and try again later since we could not store it right now
            cacheUndeliveredData(
                data.timestamp,
                data.electricity.received.tariff1.reading,
                data.electricity.received.tariff2.reading,
                data.electricity.received.actual.reading,
                data.gas.reading
            );
        });
});

p1Reader.on('error', error => {
    console.log(error);
});

p1Reader.on('close', () => {
    console.log('Connection closed');
});

// Handle all uncaught errors without crashing
process.on('uncaughtException', error => {
    console.error(error);
});

// Write data to CSV file if it could not be delivered to the InfluxDB server to be processed later
function cacheUndeliveredData (timestamp, electricity_tarrif1, electricity_tarrif2, electricity_actual, gas_reading) {
    var csvOutput = '' +
    timestamp + ';' +
    electricity_tarrif1 + ';' +
    electricity_tarrif2 + ';' +
    electricity_actual + ';' +
    gas_reading + '\n';

    fs.appendFile(undeliveredDataFile, csvOutput, error => {
        console.log('Could not write undelivered data to file', error);
    });
}