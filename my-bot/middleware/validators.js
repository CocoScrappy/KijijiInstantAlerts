
export function checkIfValidURL(url) {
  try {
    // regex to check link validity https://www.kijiji.ca/anything
    const regex = new RegExp(/^(https:\/\/www.kijiji.ca\/).*/);
    return regex.test(url);
  } catch (err) {
    return false;
  }
}

export const checkIfValidEmail = (email) => {
  try {
    // regex to check email validity
    const regex = new RegExp(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    return regex.test(email);
  } catch (err) {
    return false;
  }
}

export const checkIfValidPassword = (password) => {
    try {
        // regex to check password validity
        const regex = new RegExp(/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/);
        return regex.test(password);
    } catch (err) {
        return false;
    }
    }

export const checkIfValidUsername = (username) => {
    try {
        // regex to check username validity
        const regex = new RegExp(/^[a-zA-Z0-9]+$/);
        return regex.test(username);
    } catch (err) {
        return false;
    }
}

