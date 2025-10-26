import axios from 'axios';
import { auth } from '../firebaseConfig';

// Update with YOUR MacBook's IP
const API_BASE_URL = 'http://192.168.4.60:5205/api'; // CHANGE THIS!

console.log('🔗 API Base URL:', API_BASE_URL);

const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
    timeout: 30000,
});

apiClient.interceptors.request.use(
    async (config) => {
        console.log('📡 Making request to:', config.url);
        console.log('📦 Request body:', JSON.stringify(config.data, null, 2));

        const user = auth.currentUser;
        if (user) {
            try {
                const token = await user.getIdToken();
                config.headers.Authorization = `Bearer ${token}`;
            } catch (error) {
                console.error('Error getting auth token:', error);
            }
        }
        return config;
    },
    (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
    (response) => {
        console.log('✅ Response status:', response.status);
        console.log('📥 Response data:', JSON.stringify(response.data, null, 2));
        return response;
    },
    (error) => {
        console.error('❌ API Error:', error.message);
        if (error.response) {
            console.error('❌ Error response:', JSON.stringify(error.response.data, null, 2));
        }
        return Promise.reject(error);
    }
);

export const paymentService = {
    createCustomer: async (email: string, name: string, metadata: Record<string, string> = {}) => {
        console.log('👤 Creating customer...');
        const response = await apiClient.post('/Payment/create-customer', {
            email,
            name,
            metadata,
        });
        return response.data;
    },

    createPaymentIntent: async (
        amount: number,
        currency: string = 'usd',
        description?: string,
        customerId?: string
    ) => {
        console.log('💳 Creating payment intent...');
        console.log('💳 Amount:', amount);
        console.log('💳 Currency:', currency);
        console.log('💳 Description:', description);
        console.log('💳 CustomerId:', customerId);

        const response = await apiClient.post('/Payment/create-payment-intent', {
            amount,
            currency,
            description,
            customerId,
        });

        const data = response.data;

        // Handle both camelCase and PascalCase
        const clientSecret = data.clientSecret || data.ClientSecret;
        const paymentIntentId = data.paymentIntentId || data.PaymentIntentId;

        console.log('✅ Payment Intent ID:', paymentIntentId);
        console.log('✅ Client Secret (first 50 chars):', clientSecret?.substring(0, 50));

        if (!clientSecret) {
            console.error('❌ NO CLIENT SECRET IN RESPONSE!');
            console.error('Full response:', JSON.stringify(data, null, 2));
            throw new Error('No client secret returned from server');
        }

        if (!paymentIntentId) {
            console.error('❌ NO PAYMENT INTENT ID IN RESPONSE!');
            console.error('Full response:', JSON.stringify(data, null, 2));
            throw new Error('No payment intent ID returned from server');
        }

        return {
            clientSecret,
            paymentIntentId,
            amount: data.amount || data.Amount,
            currency: data.currency || data.Currency,
        };
    },

    confirmPayment: async (paymentIntentId: string) => {
        const response = await apiClient.post('/Payment/confirm-payment', {
            paymentIntentId,
        });
        return response.data;
    },

    getPaymentIntent: async (paymentIntentId: string) => {
        const response = await apiClient.get(`/Payment/payment-intent/${paymentIntentId}`);
        return response.data;
    },

    cancelPayment: async (paymentIntentId: string) => {
        const response = await apiClient.post(`/Payment/cancel-payment/${paymentIntentId}`);
        return response.data;
    },

    createRefund: async (paymentIntentId: string, amount?: number) => {
        const response = await apiClient.post(`/Payment/refund/${paymentIntentId}`, { amount });
        return response.data;
    },

    getCustomer: async (customerId: string) => {
        const response = await apiClient.get(`/Payment/customer/${customerId}`);
        return response.data;
    },
};

export default apiClient;