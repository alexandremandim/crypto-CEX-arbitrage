import 'reflect-metadata';
import { program } from 'commander';
import { ShowOfficer } from './show-officer';

program.requiredOption('-p, --pair <string>', 'pair like BTCUSDT').parse(process.argv);

const { pair } = program.opts();

const showOfficer = new ShowOfficer(pair);


(async () => {
    await showOfficer.run()

    process.on('SIGINT', async () => {
        await showOfficer.close()
        
        clearInterval(undefined);
        process.exit(0);
    });

})();

