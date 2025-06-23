import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, serverTimestamp } from 'firebase/firestore';

// Ensure __app_id and __firebase_config are defined in the Canvas environment
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};

function App() {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [userName, setUserName] = useState('');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Initialize Firebase
    try {
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const authentication = getAuth(app);
      setDb(firestore);
      setAuth(authentication);

      // Listen for auth state changes
      const unsubscribeAuth = onAuthStateChanged(authentication, async (user) => {
        if (user) {
          setUserId(user.uid);
          console.log("Firebase Auth State Changed: User is signed in with UID:", user.uid);
        } else {
          console.log("Firebase Auth State Changed: No user is signed in.");
          // Attempt to sign in anonymously if no token is provided or user logs out
          try {
            await signInAnonymously(authentication);
            console.log("Signed in anonymously.");
          } catch (anonError) {
            console.error("Error signing in anonymously:", anonError);
            setError("Failed to sign in anonymously: " + anonError.message);
            setLoading(false);
          }
        }
        setLoading(false); // Authentication state check complete
      });

      // Sign in with custom token if available, otherwise anonymously
      const signIn = async () => {
        try {
          if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            console.log("Attempting to sign in with custom token...");
            await signInWithCustomToken(authentication, __initial_auth_token);
            console.log("Signed in with custom token.");
          } else {
            console.log("No custom token found, attempting anonymous sign in...");
            await signInAnonymously(authentication);
            console.log("Signed in anonymously.");
          }
        } catch (signInError) {
          console.error("Error during initial Firebase sign-in:", signInError);
          setError("Failed to authenticate: " + signInError.message);
          setLoading(false);
        }
      };
      signIn();

      return () => unsubscribeAuth(); // Cleanup auth listener
    } catch (initError) {
      console.error("Error initializing Firebase:", initError);
      setError("Failed to initialize Firebase: " + initError.message);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (db && userId) {
      console.log("Firestore ready. Setting up snapshot listener for userId:", userId);
      // Define the collection path for public data
      const messagesCollectionRef = collection(db, `artifacts/${appId}/public/data/userData`);
      const q = query(messagesCollectionRef);

      const unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
        const fetchedMessages = [];
        snapshot.forEach((doc) => {
          fetchedMessages.push({ id: doc.id, ...doc.data() });
        });
        // Sort messages by timestamp, newest first
        fetchedMessages.sort((a, b) => (b.timestamp?.toDate() || 0) - (a.timestamp?.toDate() || 0));
        setMessages(fetchedMessages);
        console.log("Messages updated:", fetchedMessages.length);
      }, (snapshotError) => {
        console.error("Error fetching messages from Firestore:", snapshotError);
        setError("Error fetching messages: " + snapshotError.message);
      });

      return () => unsubscribeSnapshot(); // Cleanup snapshot listener
    } else if (!loading && !db && !userId) {
      console.log("Firestore or userId not available for snapshot setup.");
      // This state indicates an issue with Firebase initialization or authentication
      // The error state would already be set by the previous useEffect if there was an issue.
    }
  }, [db, userId, loading]); // Depend on db and userId to ensure they are initialized

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!db || !userId) {
      setError("Firebase not initialized or user not authenticated. Please wait.");
      return;
    }

    if (!userName.trim() || !message.trim()) {
      setError("Name and message cannot be empty.");
      return;
    }

    try {
      await addDoc(collection(db, `artifacts/${appId}/public/data/userData`), {
        userId: userId,
        userName: userName,
        message: message,
        timestamp: serverTimestamp(),
      });
      setUserName(''); // Clear input fields after submission
      setMessage('');
      setError(null); // Clear any previous errors
    } catch (submitError) {
      console.error("Error adding document:", submitError);
      setError("Error submitting data: " + submitError.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
        <div className="text-xl font-semibold text-gray-700">Loading application...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-red-100 text-red-700 p-4 rounded-lg shadow-md">
        <div className="text-xl font-semibold">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-200 flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-2xl bg-white p-8 rounded-xl shadow-2xl space-y-8 transform hover:scale-105 transition-transform duration-300">
        <h1 className="text-4xl font-extrabold text-center text-gray-800 mb-6">
          Share Your Thoughts!
        </h1>

        <div className="text-center text-sm text-gray-600 mb-6">
          Your User ID: <span className="font-mono text-blue-600 break-all">{userId || 'N/A'}</span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="userName" className="block text-lg font-medium text-gray-700 mb-2">
              Your Name:
            </label>
            <input
              type="text"
              id="userName"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Enter your name"
              className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 text-lg"
              required
            />
          </div>

          <div>
            <label htmlFor="message" className="block text-lg font-medium text-gray-700 mb-2">
              Your Message:
            </label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What's on your mind?"
              rows="4"
              className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 text-lg resize-y"
              required
            ></textarea>
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg text-xl font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors duration-200 shadow-lg transform active:scale-98"
          >
            Submit Data
          </button>
        </form>

        <div className="mt-10 pt-8 border-t border-gray-200">
          <h2 className="text-3xl font-bold text-center text-gray-800 mb-6">
            User Submissions
          </h2>
          {messages.length === 0 ? (
            <p className="text-center text-gray-500 text-lg">No messages yet. Be the first to share!</p>
          ) : (
            <div className="space-y-4">
              {messages.map((msg) => (
                <div key={msg.id} className="bg-blue-50 p-6 rounded-lg shadow-md border border-blue-100 hover:shadow-lg transition-shadow duration-200">
                  <p className="text-xl font-semibold text-gray-900">{msg.message}</p>
                  <p className="text-right text-sm text-gray-600 mt-2">
                    — {msg.userName} {msg.timestamp ? `on ${new Date(msg.timestamp.toDate()).toLocaleString()}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
