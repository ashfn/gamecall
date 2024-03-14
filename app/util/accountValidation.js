export function validateCredentials(email, password, username) {
    const errors = [];
  
    // Validate email
    const emailRegex = /^[\w.-]+@[a-zA-Z\d.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      errors.push("Invalid email format");
    }
  
    // Validate password
    const passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}$/;
    if (!passwordRegex.test(password)) {
      errors.push("Password must be at least 8 characters and contain one number, one uppercase letter, and one lowercase letter");
    }
  
    // Validate username
    const usernameRegex = /^[a-zA-Z0-9.]{1,10}$/;
    if (!usernameRegex.test(username)) {
      errors.push("Username must be 1-10 characters long and contain only numbers, letters, and full stops");
    }
  
    return errors;
  }