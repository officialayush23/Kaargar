import React, { useState } from "react";
import './faq.css';

const faqs = [
  { 
    question: "How do I sign up as an employer?", 
    answer: "Simply download the Kaargar app or register on the website, fill in your company details, and verify your identity. Once approved, you can start posting job requests." 
  },
  { 
    question: "How do I find workers that match my requirements?", 
    answer: "Kaargar matches employers to skilled workers based on your job description, required skills, and location. You’ll receive instant recommendations for suitable candidates." 
  },
  { 
    question: "How do I pay workers?", 
    answer: "Payments are processed securely through Kaargar. Once a worker completes and you verify the job, payment is automatically transferred to their account." 
  },
  { 
    question: "How flexible are the hiring options?", 
    answer: "Kaargar allows you to hire workers for full-time, part-time, or project-based work. You can select the type of employment based on your needs." 
  },
  { 
    question: "Are the workers verified?", 
    answer: "Yes, all workers on Kaargar are verified to ensure safety and trust. You can check ratings and reviews before hiring anyone." 
  },
  { 
    question: "Can I track job progress and payments?", 
    answer: "Your employer dashboard provides a complete record of all jobs, worker progress, and payments, so you can monitor your projects efficiently." 
  },
  { 
    question: "Can I build a reliable team on Kaargar?", 
    answer: "Yes! By hiring skilled workers and checking their ratings and reviews, you can build a consistent and trustworthy team for your projects." 
  },
  { 
    question: "What if I face an issue with a worker or payment?", 
    answer: "Kaargar’s support team is available to resolve disputes, payment issues, or any other concerns promptly." 
  },
  { 
    question: "Is Kaargar safe for employers?", 
    answer: "Absolutely. We prioritize the safety of employers by verifying workers, tracking jobs, and providing secure payment systems." 
  },
  { 
    question: "How can Kaargar help grow my business?", 
    answer: "By hiring skilled workers efficiently and managing multiple projects seamlessly, Kaargar helps you scale operations and achieve business growth." 
  },
];


const FAQ1 = () => {
  const [activeIndex, setActiveIndex] = useState(null);

  const toggleFAQ = (index) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  return (
    <section id="faq" className="faq-wrapper">
      <h2 className="faq-title">Frequently Asked Questions</h2>
      <div className="faq-container">
        {faqs.map((faq, index) => (
          <div 
            key={index} 
            className={`faq-item ${activeIndex === index ? "active" : ""}`}
            onClick={() => toggleFAQ(index)}
          >
            <div className="faq-question">
              {faq.question}
              <span className="faq-toggle">{activeIndex === index ? "-" : "+"}</span>
            </div>
            {activeIndex === index && <div className="faq-answer">{faq.answer}</div>}
          </div>
        ))}
      </div>
    </section>
  );
};

export default FAQ1;
