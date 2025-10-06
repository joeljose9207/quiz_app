
import React, { useState, useCallback, FC } from 'react';
import { GoogleGenAI, Type } from "@google/genai";

// --- TYPE DEFINITIONS ---
// Defines the possible states of the application for state flow management.
type GameState = 'category' | 'loading' | 'quiz' | 'result' | 'error';

// Defines the structure of a single quiz question object.
interface Question {
  question: string;
  options: string[];
  answer: string;
}

// --- API & CONSTANTS ---
// Initialize the Gemini AI client. The API key is assumed to be in environment variables.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
const QUIZ_CATEGORIES = ["Science", "History", "Technology", "Geography", "Art"];
const MAX_RETRIES = 3;

// Defines the JSON schema for the AI's response to ensure consistent output.
const quizSchema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            question: {
                type: Type.STRING,
                description: "The quiz question."
            },
            options: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "An array of 4 possible answers."
            },
            answer: {
                type: Type.STRING,
                description: "The correct answer, which must be one of the strings in the 'options' array."
            }
        },
        required: ['question', 'options', 'answer']
    }
};


// --- UI COMPONENTS ---
// These components are defined outside the main App component to prevent re-creation on every render,
// which is a React performance best practice.

interface CategorySelectorProps {
  onSelectCategory: (category: string) => void;
}
const CategorySelector: FC<CategorySelectorProps> = ({ onSelectCategory }) => (
  <div className="text-center">
    <h1 className="text-4xl md:text-5xl font-bold mb-2">Gemini Quiz App</h1>
    <p className="text-lg text-gray-400 mb-8">Select a category to start</p>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {QUIZ_CATEGORIES.map(category => (
        <button
          key={category}
          onClick={() => onSelectCategory(category)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-lg transition-transform transform hover:scale-105 shadow-lg"
        >
          {category}
        </button>
      ))}
    </div>
  </div>
);

const LoadingSpinner: FC = () => (
  <div className="flex flex-col items-center justify-center space-y-4">
    <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500"></div>
    <p className="text-xl font-semibold text-gray-300">Generating your quiz...</p>
  </div>
);

interface QuizProps {
  question: Question;
  onAnswer: (answer: string) => void;
  onNext: () => void;
  currentIndex: number;
  totalQuestions: number;
  selectedAnswer: string | null;
  isAnswered: boolean;
}
const Quiz: FC<QuizProps> = ({ question, onAnswer, onNext, currentIndex, totalQuestions, selectedAnswer, isAnswered }) => {
  const getOptionClass = (option: string) => {
    if (!isAnswered) {
      return "bg-gray-700 hover:bg-gray-600";
    }
    if (option === question.answer) {
      return "bg-green-600 border-green-500";
    }
    if (option === selectedAnswer) {
      return "bg-red-600 border-red-500";
    }
    return "bg-gray-700 opacity-50";
  };

  return (
    <div className="w-full max-w-2xl">
      <div className="mb-6 text-center">
        <p className="text-lg font-semibold text-gray-400">Question {currentIndex + 1} of {totalQuestions}</p>
        <h2 className="text-2xl md:text-3xl font-bold mt-2">{question.question}</h2>
      </div>
      <div className="space-y-4 mb-8">
        {question.options.map((option, index) => (
          <button
            key={index}
            onClick={() => onAnswer(option)}
            disabled={isAnswered}
            className={`w-full text-left p-4 rounded-lg border-2 border-transparent transition-all duration-300 ${getOptionClass(option)}`}
          >
            {option}
          </button>
        ))}
      </div>
      {isAnswered && (
        <button
          onClick={onNext}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors shadow-lg"
        >
          {currentIndex + 1 === totalQuestions ? 'Show Results' : 'Next Question'}
        </button>
      )}
    </div>
  );
};

interface ResultProps {
  score: number;
  totalQuestions: number;
  onPlayAgain: () => void;
}
const Result: FC<ResultProps> = ({ score, totalQuestions, onPlayAgain }) => (
  <div className="text-center bg-gray-800 p-8 rounded-xl shadow-2xl">
    <h2 className="text-4xl font-bold mb-4">Quiz Complete!</h2>
    <p className="text-2xl text-gray-300 mb-6">Your Score: <span className="text-blue-400 font-extrabold">{score}</span> / {totalQuestions}</p>
    <button
      onClick={onPlayAgain}
      className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-lg transition-transform transform hover:scale-105"
    >
      Play Again
    </button>
  </div>
);

interface ErrorComponentProps {
  error: string;
  onRetry: () => void;
}
const ErrorComponent: FC<ErrorComponentProps> = ({ error, onRetry }) => (
  <div className="text-center bg-red-900 border border-red-700 p-8 rounded-xl shadow-2xl">
    <h2 className="text-3xl font-bold mb-4">An Error Occurred</h2>
    <p className="text-lg text-red-200 mb-6">{error}</p>
    <button
      onClick={onRetry}
      className="bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-bold py-3 px-8 rounded-lg transition-transform transform hover:scale-105"
    >
      Try Again
    </button>
  </div>
);

// --- MAIN APP COMPONENT ---

const App: FC = () => {
  // --- STATE MANAGEMENT ---
  // Manages the current view of the application (e.g., category selection, quiz, results).
  const [gameState, setGameState] = useState<GameState>('category');
  // Stores the list of questions fetched from the Gemini API.
  const [questions, setQuestions] = useState<Question[]>([]);
  // Tracks the index of the currently displayed question.
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  // Stores the user's score.
  const [score, setScore] = useState<number>(0);
  // Stores the user's selected answer for the current question. Null if not answered yet.
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  // A boolean flag to indicate if the current question has been answered.
  const [isAnswered, setIsAnswered] = useState<boolean>(false);
  // Holds the last selected category to enable the retry functionality.
  const [currentCategory, setCurrentCategory] = useState<string | null>(null);
  // Stores any error message from the API call.
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetches quiz questions from the Gemini API.
   * This function is memoized with `useCallback` to prevent unnecessary re-creations.
   * It includes a retry mechanism with exponential backoff for API robustness.
   */
  const fetchQuestions = useCallback(async (category: string) => {
    setGameState('loading');
    setError(null);
    let lastError: string | null = "Failed to fetch questions after multiple attempts.";

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const result = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: `Create 5 challenging multiple-choice questions about ${category}. The 'answer' must exactly match one of the 'options'.`,
          config: {
            systemInstruction: "You are an expert quiz master. Create high-quality, factual, and engaging multiple-choice questions with 4 distinct options.",
            responseMimeType: "application/json",
            responseSchema: quizSchema,
          }
        });

        const parsedQuestions = JSON.parse(result.text);
        if (Array.isArray(parsedQuestions) && parsedQuestions.length > 0) {
          setQuestions(parsedQuestions);
          setGameState('quiz');
          return; // Success, exit the loop
        } else {
            throw new Error("Received invalid or empty question data from API.");
        }

      } catch (e) {
        console.error(`Attempt ${attempt + 1} failed:`, e);
        lastError = e instanceof Error ? e.message : "An unknown error occurred.";
        if (attempt < MAX_RETRIES - 1) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 1s, 2s
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // If all retries fail
    setError(lastError);
    setGameState('error');
  }, []);

  // --- EVENT HANDLERS ---

  /**
   * Resets the application state to its initial values to start a new quiz.
   */
  const resetGame = () => {
    setGameState('category');
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setScore(0);
    setSelectedAnswer(null);
    setIsAnswered(false);
    setCurrentCategory(null);
    setError(null);
  };

  /**
   * Handles the user selecting a quiz category.
   * @param category The category string selected by the user.
   */
  const handleCategorySelect = (category: string) => {
    setCurrentCategory(category);
    fetchQuestions(category);
  };

  /**
   * Handles the user's answer selection.
   * It checks if the answer is correct, updates the score, and provides visual feedback.
   * @param answer The answer string chosen by the user.
   */
  const handleAnswer = (answer: string) => {
    if (isAnswered) return;
    setSelectedAnswer(answer);
    setIsAnswered(true);
    if (answer === questions[currentQuestionIndex].answer) {
      setScore(prev => prev + 1);
    }
  };

  /**
   * Moves to the next question or to the result screen if the quiz is finished.
   */
  const handleNext = () => {
    setIsAnswered(false);
    setSelectedAnswer(null);
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      setGameState('result');
    }
  };

  /**
   * Handles the "Play Again" action from the result screen.
   */
  const handlePlayAgain = () => {
    resetGame();
  };
  
  /**
   * Handles the retry action from the error screen.
   */
  const handleRetry = () => {
      if (currentCategory) {
          fetchQuestions(currentCategory);
      } else {
          resetGame(); // Should not happen, but as a fallback
      }
  };


  // --- RENDER LOGIC ---

  /**
   * Conditionally renders the current view based on the `gameState`.
   * This acts as a simple state machine for the UI.
   */
  const renderContent = () => {
    switch (gameState) {
      case 'category':
        return <CategorySelector onSelectCategory={handleCategorySelect} />;
      case 'loading':
        return <LoadingSpinner />;
      case 'quiz':
        return questions.length > 0 && (
          <Quiz
            question={questions[currentQuestionIndex]}
            onAnswer={handleAnswer}
            onNext={handleNext}
            currentIndex={currentQuestionIndex}
            totalQuestions={questions.length}
            selectedAnswer={selectedAnswer}
            isAnswered={isAnswered}
          />
        );
      case 'result':
        return <Result score={score} totalQuestions={questions.length} onPlayAgain={handlePlayAgain} />;
      case 'error':
        return <ErrorComponent error={error || "An unknown error occurred."} onRetry={handleRetry} />;
      default:
        return <CategorySelector onSelectCategory={handleCategorySelect} />;
    }
  };

  return (
    <main className="min-h-screen w-full flex items-center justify-center p-4">
      <div className="w-full max-w-4xl mx-auto">
        {renderContent()}
      </div>
    </main>
  );
};

export default App;
