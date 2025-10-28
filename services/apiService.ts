// API Service - Axios client for backend communication
// Handles authentication, logging, and payment operations

import axios from 'axios';
import { auth } from '../firebaseConfig';

// Backend API configuration - update this to your local network IP
const API_BASE_URL = 'http://10.193.161.247:5205/api'; // CHANGE THIS!

console.log('🔗 API Base URL:', API_BASE_URL);

// Create axios instance with base configuration
const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
    timeout: 30000, // 30 second timeout
});

/**
 * IMPORTANT: Request interceptor
 * Automatically adds Firebase auth token to every API request
 * This authenticates the user with the backend
 */
apiClient.interceptors.request.use(
    async (config) => {
        console.log('📡 Making request to:', config.url);
        console.log('📦 Request body:', JSON.stringify(config.data, null, 2));

        // Get current Firebase user and attach their token
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

/**
 * Response interceptor
 * Logs all responses and errors for debugging
 */
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

/**
 * Payment service methods
 * Wraps backend payment API endpoints with proper error handling
 */
export const paymentService = {
    // Create a new Stripe customer
    createCustomer: async (email: string, name: string, metadata: Record<string, string> = {}) => {
        console.log('👤 Creating customer...');
        const response = await apiClient.post('/Payment/create-customer', {
            email,
            name,
            metadata,
        });
        return response.data;
    },

    /**
     * CRITICAL: Create payment intent for processing payment
     * Returns client secret needed by Stripe SDK on mobile
     *
     * Handles both camelCase and PascalCase response formats from backend
     * (C# API returns PascalCase, but we normalize to camelCase)
     */
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

        // Handle both naming conventions from backend
        const clientSecret = data.clientSecret || data.ClientSecret;
        const paymentIntentId = data.paymentIntentId || data.PaymentIntentId;

        console.log('✅ Payment Intent ID:', paymentIntentId);
        console.log('✅ Client Secret (first 50 chars):', clientSecret?.substring(0, 50));

        // Validate response - these are required for Stripe SDK
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

    // Manually confirm a payment intent
    confirmPayment: async (paymentIntentId: string) => {
        const response = await apiClient.post('/Payment/confirm-payment', {
            paymentIntentId,
        });
        return response.data;
    },

    // Retrieve payment intent details
    getPaymentIntent: async (paymentIntentId: string) => {
        const response = await apiClient.get(`/Payment/payment-intent/${paymentIntentId}`);
        return response.data;
    },

    // Cancel a pending payment
    cancelPayment: async (paymentIntentId: string) => {
        const response = await apiClient.post(`/Payment/cancel-payment/${paymentIntentId}`);
        return response.data;
    },

    // Create a refund for a completed payment
    createRefund: async (paymentIntentId: string, amount?: number) => {
        const response = await apiClient.post(`/Payment/refund/${paymentIntentId}`, { amount });
        return response.data;
    },

    // Retrieve customer details from Stripe
    getCustomer: async (customerId: string) => {
        const response = await apiClient.get(`/Payment/customer/${customerId}`);
        return response.data;
    },
};

export default apiClient;