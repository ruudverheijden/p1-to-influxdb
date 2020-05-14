# P1-to-InfluxDB
Simple Node.js application to read the P1 Smart Meter data and send it to an InfluxDB server. This application can be used as an example on how to [p1-reader NPM package](https://github.com/ruudverheijden/node-p1-reader)

## Usage
Simply fill in all values of the config.json file and you should be good to go.
By default it stores only the Electricity "Received" values for Tariff 1 + 2 and the Gas readings but if you want more you can easily extend the script.

Have a look at https://github.com/ruudverheijden/node-p1-reader to view all values that can be retrieved from the P1 Smart Meter.
