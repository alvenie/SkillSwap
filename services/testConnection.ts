export const testConnection = async (ip: string) => {
    try {
        console.log(`Testing connection to: http://${ip}:5205/swagger`);
        const response = await fetch(`http://${ip}:5205/swagger`, {
            method: 'GET',
        });
        console.log('✅ Connection successful!', response.status);
        return true;
    } catch (error: any) {
        console.error('❌ Connection failed:', error.message);
        return false;
    }
};