const initSqlJs = require('sql.js');
const fs = require('fs');

async function main() {
    const SQL = await initSqlJs();
    const buffer = fs.readFileSync('./movilbro_6mb.db');
    console.log('File size:', buffer.length, 'bytes (' + (buffer.length/1024/1024).toFixed(2) + ' MB)');
    
    try {
        const db = new SQL.Database(buffer);
        
        // Check integrity
        try {
            const integrity = db.exec("PRAGMA integrity_check");
            console.log('Integrity:', JSON.stringify(integrity));
        } catch(e) {
            console.log('Integrity check failed:', e.message.substring(0, 100));
        }
        
        // List all tables
        const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
        console.log('\nTables:');
        let totalRows = 0;
        for (const t of tables[0].values) {
            const name = t[0];
            try {
                const count = db.exec("SELECT COUNT(*) as c FROM '" + name.replace(/'/g, "''") + "'");
                const c = count[0].values[0][0];
                if (c > 0) {
                    console.log('  ' + name + ': ' + c);
                    totalRows += c;
                }
            } catch(e) {
                console.log('  ' + name + ': ERROR - ' + e.message.substring(0, 60));
            }
        }
        console.log('Total rows with data:', totalRows);
        
        // ISP tables specifically
        const ispTabs = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'isp_%' ORDER BY name");
        if (ispTabs.length > 0) {
            console.log('\nISP tables:');
            for (const t of ispTabs[0].values) {
                try {
                    const count = db.exec("SELECT COUNT(*) FROM '" + t[0].replace(/'/g, "''") + "'");
                    console.log('  ' + t[0] + ': ' + count[0].values[0][0]);
                } catch(e) {}
            }
        }
        
        // Users
        try {
            const users = db.exec("SELECT id, username, email, rol FROM users");
            console.log('\nUsers:');
            users[0].values.forEach(u => console.log('  ' + u[0] + ': ' + u[1] + ' / ' + u[2] + ' (' + u[3] + ')'));
        } catch(e) {
            console.log('Users error:', e.message.substring(0, 100));
        }
        
        // Save fixed version
        const data = db.export();
        fs.writeFileSync('./movilbro_6mb_fixed.db', Buffer.from(data));
        console.log('\nFixed DB saved:', data.length, 'bytes (' + (data.length/1024/1024).toFixed(2) + ' MB)');
        
        db.close();
    } catch(e) {
        console.log('Fatal error:', e.message);
    }
}

main();
