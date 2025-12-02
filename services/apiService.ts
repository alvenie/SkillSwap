import axios from 'axios';
import { auth } from '../firebaseConfig';

const API_BASE_URL = 'http://10.239.217.140:5205/api'; // UPDATE THIS!

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
        const response = await apiClient.post('/Payment/create-payment-intent', {
            amount,
            currency,
            description,
            customerId,
        });

        const data = response.data;
        const clientSecret = data.clientSecret || data.ClientSecret;
        const paymentIntentId = data.paymentIntentId || data.PaymentIntentId;

        if (!clientSecret) {
            throw new Error('No client secret returned from server');
        }

        if (!paymentIntentId) {
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

export const calendarService = {
    createMeeting: async (meetingData: {
        requesterId: string;
        receiverId: string;
        title: string;
        description?: string;
        startTime: Date;
        endTime: Date;
        location?: string;
        skillName?: string;
    }) => {
        console.log('📅 Creating meeting...');
        const response = await apiClient.post('/Calendar/create-meeting', {
            requesterId: meetingData.requesterId,
            receiverId: meetingData.receiverId,
            title: meetingData.title,
            description: meetingData.description,
            startTime: meetingData.startTime.toISOString(),
            endTime: meetingData.endTime.toISOString(),
            location: meetingData.location,
            skillName: meetingData.skillName,
        });
        return response.data;
    },

    updateMeetingStatus: async (
        meetingId: string,
        status: 'accepted' | 'declined' | 'cancelled',
        reason?: string
    ) => {
        console.log(`📅 Updating meeting ${meetingId} to ${status}`);
        const response = await apiClient.put('/Calendar/update-status', {
            meetingId,
            status,
            reason,
        });
        return response.data;
    },

    getMeeting: async (meetingId: string) => {
        console.log(`📅 Getting meeting ${meetingId}`);
        const response = await apiClient.get(`/Calendar/meeting/${meetingId}`);
        return response.data;
    },

    getUserMeetings: async (userId: string, startDate?: Date, endDate?: Date) => {
        console.log(`📅 Getting meetings for user ${userId}`);
        const params: any = {};
        if (startDate) params.startDate = startDate.toISOString();
        if (endDate) params.endDate = endDate.toISOString();

        const response = await apiClient.get(`/Calendar/user/${userId}/meetings`, { params });
        return response.data;
    },

    getPendingRequests: async (userId: string) => {
        console.log(`📅 Getting pending requests for user ${userId}`);
        const response = await apiClient.get(`/Calendar/user/${userId}/pending-requests`);
        return response.data;
    },

    getUserAvailability: async (userId: string, date: Date) => {
        console.log(`📅 Getting availability for user ${userId} on ${date}`);
        const response = await apiClient.get(`/Calendar/user/${userId}/availability`, {
            params: { date: date.toISOString() },
        });
        return response.data;
    },

    checkAvailability: async (userId: string, startTime: Date, endTime: Date) => {
        console.log(`📅 Checking availability for user ${userId}`);
        const response = await apiClient.post('/Calendar/check-availability', {
            userId,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
        });
        return response.data;
    },

    cancelMeeting: async (meetingId: string, userId: string) => {
        console.log(`📅 Cancelling meeting ${meetingId}`);
        const response = await apiClient.delete(`/Calendar/meeting/${meetingId}`, {
            params: { userId },
        });
        return response.data;
    },
};

export default apiClient;